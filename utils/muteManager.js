const { scheduleJob } = require('node-schedule');
const fs = require('fs').promises;
const path = require('path');

class MuteManager {
    constructor(client) {
        this.client = client;
        this.mutesPath = path.join(__dirname, '../data/mutes.json');
        this.activeJobs = new Map();
        this.loadAndScheduleMutes();
    }

    async loadAndScheduleMutes() {
        try {
            const mutesData = await this.getMutes();
            const currentTime = Math.floor(Date.now() / 1000);

            this.activeJobs.forEach(job => job.cancel());
            this.activeJobs.clear();

            const activeMutes = mutesData.users.filter(mute => mute.muteEndTime > currentTime);
            for (const mute of activeMutes) {
                this.scheduleMuteExpiration(mute);
            }

            console.log(`Scheduled ${activeMutes.length} unmute jobs`);
        } catch (error) {
            console.error('Error loading mutes:', error);
        }
    }

    async getMutes() {
        try {
            const data = await fs.readFile(this.mutesPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error(`Error reading mutes file:`, error);
            const defaultData = { users: [] };
            await fs.writeFile(this.mutesPath, JSON.stringify(defaultData), 'utf8');
            return defaultData;
        }
    }

    async saveMutes(mutesData) {
        await fs.writeFile(this.mutesPath, JSON.stringify(mutesData, null, 4), 'utf8');
    }

    async addMute(userId, guildId, roleId, duration, issuerId = null, muteChainId = null) {
        try {
            console.log(`Adding mute for ${userId}, issued by ${issuerId}, duration: ${duration}s`);

            const mutesData = await this.getMutes();
            const currentTime = Math.floor(Date.now() / 1000);
            const muteEndTime = currentTime + duration;

            // Remove any existing mute entry for this user
            mutesData.users = mutesData.users.filter(mute => mute.userId !== userId);

            if (!muteChainId) {
                muteChainId = `chain_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            }

            const muteData = {
                userId,
                guildId,
                roleId,
                muteStartTime: currentTime,
                muteEndTime,
                button_clicked: false, // fresh mute always allows one risk attempt
                issuerId,
                muteChainId
            };

            console.log(`Mute data created:`, JSON.stringify(muteData));

            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) {
                console.error(`Guild ${guildId} not found`);
                return null;
            }

            let member;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    member = await guild.members.fetch(userId);
                    break;
                } catch (e) {
                    if (attempt === 3) {
                        console.error(`Failed to fetch member ${userId} after 3 attempts`);
                        return null;
                    }
                    await new Promise(r => setTimeout(r, 1000));
                }
            }

            if (!member) {
                console.error(`Member ${userId} not found`);
                return null;
            }

            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    await member.roles.add(roleId);
                    console.log(`Successfully muted ${member.user.tag} for ${duration} seconds`);
                    break;
                } catch (e) {
                    if (attempt === 3) {
                        console.error(`Failed to add role to ${member.user.tag} after 3 attempts`, e);
                        return null;
                    }
                    await new Promise(r => setTimeout(r, 1000));
                }
            }

            mutesData.users.push(muteData);
            await this.saveMutes(mutesData);
            this.scheduleMuteExpiration(muteData);

            return muteData;
        } catch (error) {
            console.error(`Error adding mute:`, error);
            return null;
        }
    }

    scheduleMuteExpiration(muteData) {
        const { userId, guildId, roleId, muteEndTime } = muteData;
        const jobId = `unmute_${userId}`;

        if (this.activeJobs.has(jobId)) {
            this.activeJobs.get(jobId).cancel();
        }

        const unmuteMsec = muteEndTime * 1000;
        const now = Date.now();

        if (unmuteMsec <= now) {
            this.executeUnmute(userId, guildId, roleId);
            return;
        }

        const job = scheduleJob(new Date(unmuteMsec), () => {
            this.executeUnmute(userId, guildId, roleId);
        });

        this.activeJobs.set(jobId, job);
        console.log(`Scheduled unmute for user ${userId} at ${new Date(unmuteMsec)}`);
    }

    async executeUnmute(userId, guildId, roleId) {
        try {
            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) {
                console.error(`Guild ${guildId} not found`);
                return this.cleanupMute(userId);
            }

            let member;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    member = await guild.members.fetch(userId);
                    break;
                } catch (e) {
                    if (attempt === 3) {
                        console.error(`Failed to fetch member ${userId} after 3 attempts`);
                        return this.cleanupMute(userId);
                    }
                    await new Promise(r => setTimeout(r, 1000));
                }
            }

            if (member && member.roles.cache.has(roleId)) {
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        await member.roles.remove(roleId);
                        console.log(`Successfully unmuted ${member.user.tag}`);
                        break;
                    } catch (e) {
                        if (attempt === 3) {
                            console.error(`Failed to remove role from ${member.user.tag} after 3 attempts`, e);
                        }
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
            }

            await this.cleanupMute(userId);
        } catch (error) {
            console.error(`Error in executeUnmute:`, error);
            await this.cleanupMute(userId);
        }
    }

    async cleanupMute(userId) {
        try {
            const mutesData = await this.getMutes();
            mutesData.users = mutesData.users.filter(mute => mute.userId !== userId);
            await this.saveMutes(mutesData);

            const jobId = `unmute_${userId}`;
            if (this.activeJobs.has(jobId)) {
                this.activeJobs.get(jobId).cancel();
                this.activeJobs.delete(jobId);
            }
        } catch (error) {
            console.error(`Error cleaning up mute for ${userId}:`, error);
        }
    }

    async handleRiskButton(interaction) {
        try {
            await interaction.deferUpdate();
            const mutedRoleId = '673978861335085107';

            // Only muted users can press this
            if (!interaction.member.roles.cache.has(mutedRoleId)) {
                return await interaction.followUp({
                    content: 'You are not muted. This button is not for you.',
                    ephemeral: true
                });
            }

            // Always read fresh from disk to avoid stale data
            const mutesData = await this.getMutes();
            const userMute = mutesData.users.find(mute => mute.userId === interaction.user.id);

            if (!userMute) {
                return await interaction.followUp({
                    content: 'Could not find your mute data. Your mute may have already expired.',
                    ephemeral: true
                });
            }

            // One risk attempt per mute — once button_clicked is set it never resets for this mute
            if (userMute.button_clicked) {
                return await interaction.followUp({
                    content: 'You already used the risk button for this mute.',
                    ephemeral: true
                });
            }

            const currentTime = Math.floor(Date.now() / 1000);
            const remainingTime = userMute.muteEndTime - currentTime;

            if (remainingTime <= 0) {
                return await interaction.followUp({
                    content: 'Your mute has already expired.',
                    ephemeral: true
                });
            }

            // Lock the button FIRST before anything else so there's no window to double-press
            userMute.button_clicked = true;
            const muteIdx = mutesData.users.findIndex(m => m.userId === interaction.user.id);
            if (muteIdx !== -1) mutesData.users[muteIdx] = userMute;
            await this.saveMutes(mutesData);

            const success = Math.random() < 0.5;
            const doubledTime = Math.floor(remainingTime * 2);

            if (success) {
                // ── SUCCESS ─────────────────────────────────────────────────
                // Remove mute role from the button presser
                try {
                    await interaction.member.roles.remove(mutedRoleId);
                } catch (error) {
                    console.error(`Error removing mute role on risk success:`, error);
                    // Roll back button_clicked so they can try again
                    userMute.button_clicked = false;
                    if (muteIdx !== -1) mutesData.users[muteIdx] = userMute;
                    await this.saveMutes(mutesData);
                    return await interaction.followUp({
                        content: 'Something went wrong removing your mute role. Please try again.',
                        ephemeral: true
                    });
                }

                await this.cleanupMute(interaction.user.id);

                const issuerId = userMute.issuerId;
                const muteChainId = userMute.muteChainId;

                // If issuerId is missing or is themselves (self-inflicted fail mute) — just free them
                if (!issuerId || issuerId === interaction.user.id) {
                    return await interaction.followUp({
                        content: `${interaction.user} took the risk and won! They are no longer muted.`
                    });
                }

                // Pass a doubled mute to the issuer
                const issuerMember = await interaction.guild.members.fetch(issuerId).catch(() => null);

                if (!issuerMember) {
                    return await interaction.followUp({
                        content: `${interaction.user} took the risk and won! They are no longer muted. (Could not find the other person in the server)`
                    });
                }

                if (issuerMember.roles.cache.has(mutedRoleId)) {
                    return await interaction.followUp({
                        content: `${interaction.user} took the risk and won! They are no longer muted. (${issuerMember.user.username} is already muted)`
                    });
                }

                const returnMute = await this.addMute(
                    issuerId,
                    interaction.guild.id,
                    mutedRoleId,
                    doubledTime,
                    interaction.user.id, // button presser becomes the new issuer
                    muteChainId          // keep the same chain so the chain continues
                );

                if (returnMute) {
                    return await interaction.followUp({
                        content: `${interaction.user} took the risk and won! <@${issuerId}> is now muted for ${doubledTime} seconds and can press the risk button.`
                    });
                } else {
                    return await interaction.followUp({
                        content: `${interaction.user} took the risk and won! They are no longer muted. (Failed to apply return mute to the other person)`
                    });
                }

            } else {
                // ── FAIL ────────────────────────────────────────────────────
                // Double the presser's own mute. button_clicked already true — no more attempts.
                const newEndTime = currentTime + doubledTime;
                userMute.muteEndTime = newEndTime;

                // Write updated entry in-place — do NOT call addMute (that would reset button_clicked)
                const freshMutes = await this.getMutes();
                const freshIdx = freshMutes.users.findIndex(m => m.userId === interaction.user.id);
                if (freshIdx !== -1) {
                    freshMutes.users[freshIdx] = userMute;
                } else {
                    freshMutes.users.push(userMute);
                }
                await this.saveMutes(freshMutes);

                // Reschedule the unmute job for the new end time
                this.scheduleMuteExpiration(userMute);

                return await interaction.followUp({
                    content: `${interaction.user} took the risk and lost. Their mute is now doubled to ${doubledTime} seconds. No more risks for this mute.`
                });
            }

        } catch (error) {
            console.error(`Error in handleRiskButton:`, error);
            try {
                await interaction.followUp({
                    content: 'An error occurred while processing your risk attempt.',
                    ephemeral: true
                });
            } catch (e) {
                console.error('Error sending risk error followup:', e);
            }
        }
    }
}

module.exports = MuteManager;