const { scheduleJob } = require('node-schedule');
const fs = require('fs').promises;
const path = require('path');

/*
 * Risk state is stored separately in data/riskState.json
 * Schema: { [userId]: { canUseRisk: bool, issuerId: string|null, muteEndTime: number } }
 *
 * Rules:
 *   - A fresh risk entry is created every time a user is muted
 *   - canUseRisk starts true, flipped to false the moment they press the button (win or lose)
 *   - On win: issuer gets a new mute + fresh risk entry (canUseRisk: true)
 *   - On lose: duration doubles, canUseRisk stays false — no more button for this mute
 *   - Entry is deleted when the mute expires via cleanupMute
 */

class MuteManager {
    constructor(client) {
        this.client = client;
        this.mutesPath = path.join(__dirname, '../data/mutes.json');
        this.riskPath = path.join(__dirname, '../data/riskState.json');
        this.activeJobs = new Map();
        this.loadAndScheduleMutes();
    }

    // ─── File helpers ────────────────────────────────────────────────────────

    async getMutes() {
        try {
            const data = await fs.readFile(this.mutesPath, 'utf8');
            return JSON.parse(data);
        } catch {
            const def = { users: [] };
            await fs.writeFile(this.mutesPath, JSON.stringify(def), 'utf8');
            return def;
        }
    }

    async saveMutes(mutesData) {
        await fs.writeFile(this.mutesPath, JSON.stringify(mutesData, null, 4), 'utf8');
    }

    async getRiskState() {
        try {
            const data = await fs.readFile(this.riskPath, 'utf8');
            return JSON.parse(data);
        } catch {
            const def = {};
            await fs.writeFile(this.riskPath, JSON.stringify(def), 'utf8');
            return def;
        }
    }

    async saveRiskState(state) {
        await fs.writeFile(this.riskPath, JSON.stringify(state, null, 4), 'utf8');
    }

    // ─── Startup ─────────────────────────────────────────────────────────────

    async loadAndScheduleMutes() {
        try {
            const mutesData = await this.getMutes();
            const currentTime = Math.floor(Date.now() / 1000);

            this.activeJobs.forEach(job => job.cancel());
            this.activeJobs.clear();

            const activeMutes = mutesData.users.filter(m => m.muteEndTime > currentTime);
            for (const mute of activeMutes) {
                this.scheduleMuteExpiration(mute);
            }

            console.log(`Scheduled ${activeMutes.length} unmute jobs`);
        } catch (error) {
            console.error('Error loading mutes:', error);
        }
    }

    // ─── Fetch helpers (always force-fetch to avoid stale cache) ─────────────

    async fetchMember(guild, userId) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                // Force fetch — bypasses potentially stale cache
                return await guild.members.fetch({ user: userId, force: true });
            } catch (e) {
                if (attempt === 3) {
                    console.error(`Failed to fetch member ${userId} after 3 attempts:`, e);
                    return null;
                }
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    async applyRole(member, roleId) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await member.roles.add(roleId);
                return true;
            } catch (e) {
                if (attempt === 3) {
                    console.error(`Failed to add role to ${member.user.tag} after 3 attempts:`, e);
                    return false;
                }
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    async removeRole(member, roleId) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await member.roles.remove(roleId);
                return true;
            } catch (e) {
                if (attempt === 3) {
                    console.error(`Failed to remove role from ${member.user.tag} after 3 attempts:`, e);
                    return false;
                }
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    // ─── Core mute logic ─────────────────────────────────────────────────────

    async addMute(userId, guildId, roleId, duration, issuerId = null) {
        try {
            console.log(`Adding mute for ${userId}, issued by ${issuerId}, duration: ${duration}s`);

            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) {
                console.error(`Guild ${guildId} not found`);
                return null;
            }

            const member = await this.fetchMember(guild, userId);
            if (!member) return null;

            const currentTime = Math.floor(Date.now() / 1000);
            const muteEndTime = currentTime + duration;

            // Remove any existing mute entry for this user
            const mutesData = await this.getMutes();
            mutesData.users = mutesData.users.filter(m => m.userId !== userId);

            const muteData = {
                userId,
                guildId,
                roleId,
                muteStartTime: currentTime,
                muteEndTime,
                issuerId
            };

            console.log(`Mute data created:`, JSON.stringify(muteData));

            // Apply the Discord role
            const roleApplied = await this.applyRole(member, roleId);
            if (!roleApplied) return null;

            console.log(`Successfully muted ${member.user.tag} for ${duration} seconds`);

            // Persist mute
            mutesData.users.push(muteData);
            await this.saveMutes(mutesData);

            // Create a fresh risk entry — user can press the button once
            const riskState = await this.getRiskState();
            riskState[userId] = {
                canUseRisk: true,
                issuerId: issuerId,
                muteEndTime
            };
            await this.saveRiskState(riskState);

            // Schedule unmute
            this.scheduleMuteExpiration(muteData);

            return muteData;
        } catch (error) {
            console.error(`Error adding mute:`, error);
            return null;
        }
    }

    // ─── Scheduling ──────────────────────────────────────────────────────────

    scheduleMuteExpiration(muteData) {
        const { userId, guildId, roleId, muteEndTime } = muteData;
        const jobId = `unmute_${userId}`;

        if (this.activeJobs.has(jobId)) {
            this.activeJobs.get(jobId).cancel();
        }

        const unmuteMsec = muteEndTime * 1000;
        if (unmuteMsec <= Date.now()) {
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

            const member = await this.fetchMember(guild, userId);

            if (member && member.roles.cache.has(roleId)) {
                await this.removeRole(member, roleId);
                console.log(`Successfully unmuted ${member.user.tag}`);
            }

            await this.cleanupMute(userId);
        } catch (error) {
            console.error(`Error in executeUnmute:`, error);
            await this.cleanupMute(userId);
        }
    }

    async cleanupMute(userId) {
        try {
            // Remove mute entry
            const mutesData = await this.getMutes();
            mutesData.users = mutesData.users.filter(m => m.userId !== userId);
            await this.saveMutes(mutesData);

            // Remove risk entry
            const riskState = await this.getRiskState();
            delete riskState[userId];
            await this.saveRiskState(riskState);

            // Cancel scheduled job
            const jobId = `unmute_${userId}`;
            if (this.activeJobs.has(jobId)) {
                this.activeJobs.get(jobId).cancel();
                this.activeJobs.delete(jobId);
            }
        } catch (error) {
            console.error(`Error cleaning up mute for ${userId}:`, error);
        }
    }

    // ─── Risk button ─────────────────────────────────────────────────────────

    async handleRiskButton(interaction) {
        try {
            await interaction.deferUpdate();
            const mutedRoleId = '673978861335085107';

            // Must be muted
            // Force-fetch the member so roles are up to date
            const member = await this.fetchMember(interaction.guild, interaction.user.id);
            if (!member || !member.roles.cache.has(mutedRoleId)) {
                return await interaction.followUp({
                    content: 'This button is only for muted users.',
                    ephemeral: true
                });
            }

            // Load risk state for this user
            const riskState = await this.getRiskState();
            const userRisk = riskState[interaction.user.id];

            if (!userRisk) {
                return await interaction.followUp({
                    content: 'No risk data found for your mute.',
                    ephemeral: true
                });
            }

            if (!userRisk.canUseRisk) {
                return await interaction.followUp({
                    content: 'You have already used the risk button for this mute.',
                    ephemeral: true
                });
            }

            const currentTime = Math.floor(Date.now() / 1000);
            const remainingTime = userRisk.muteEndTime - currentTime;

            if (remainingTime <= 0) {
                return await interaction.followUp({
                    content: 'Your mute has already expired.',
                    ephemeral: true
                });
            }

            // Consume the risk token immediately — prevents double-click races
            riskState[interaction.user.id].canUseRisk = false;
            await this.saveRiskState(riskState);

            const success = Math.random() < 0.5;

            if (success) {
                // ── Win path ─────────────────────────────────────────────────

                const issuerId = userRisk.issuerId;

                // Unmute the winner
                await this.removeRole(member, mutedRoleId);
                await this.cleanupMute(interaction.user.id);

                let responseMessage;

                if (issuerId && issuerId !== interaction.user.id) {
                    const issuer = await this.fetchMember(interaction.guild, issuerId);

                    if (issuer && !issuer.roles.cache.has(mutedRoleId)) {
                        const doubledTime = remainingTime * 2;
                        const returnResult = await this.addMute(
                            issuerId,
                            interaction.guild.id,
                            mutedRoleId,
                            doubledTime,
                            interaction.user.id  // winner is now the issuer
                        );

                        if (returnResult) {
                            responseMessage = `${interaction.user} took the risk and succeeded! <@${issuerId}> is muted for ${Math.floor(doubledTime)} seconds.`;
                        } else {
                            responseMessage = `${interaction.user} took the risk and succeeded. They are no longer muted! (Could not apply return mute)`;
                        }
                    } else {
                        const reason = issuer ? 'issuer is already muted' : 'issuer not found in server';
                        responseMessage = `${interaction.user} took the risk and succeeded. They are no longer muted! (${reason})`;
                    }
                } else {
                    responseMessage = `${interaction.user} took the risk and succeeded. They are no longer muted!`;
                }

                await interaction.followUp({ content: responseMessage });

            } else {
                // ── Lose path ─────────────────────────────────────────────────

                const doubledTime = remainingTime * 2;
                const newEndTime = currentTime + doubledTime;

                // Update mute end time
                const mutesData = await this.getMutes();
                const userMute = mutesData.users.find(m => m.userId === interaction.user.id);

                if (userMute) {
                    userMute.muteEndTime = newEndTime;
                    await this.saveMutes(mutesData);
                    this.scheduleMuteExpiration(userMute);
                }

                // Update risk state end time but canUseRisk stays false
                const updatedRisk = await this.getRiskState();
                if (updatedRisk[interaction.user.id]) {
                    updatedRisk[interaction.user.id].muteEndTime = newEndTime;
                    await this.saveRiskState(updatedRisk);
                }

                await interaction.followUp({
                    content: `${interaction.user} took the risk and failed miserably. Mute duration is now doubled to **${Math.floor(doubledTime)}** seconds.`
                });
            }

        } catch (error) {
            console.error(`Error in handleRiskButton:`, error);
            try {
                await interaction.followUp({
                    content: 'An error occurred while processing your risk attempt.',
                    ephemeral: true
                });
            } catch (followUpError) {
                console.error('Error sending follow-up:', followUpError);
            }
        }
    }
}

module.exports = MuteManager;