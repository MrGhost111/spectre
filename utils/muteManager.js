const { scheduleJob } = require('node-schedule');
const fs = require('fs').promises;
const path = require('path');

class MuteManager {
    constructor(client) {
        this.client = client;
        this.mutesPath = path.join(__dirname, '../data/mutes.json');
        this.activeJobs = new Map(); // Store active unmute jobs
        this.loadAndScheduleMutes();
    }

    async loadAndScheduleMutes() {
        try {
            const mutesData = await this.getMutes();
            const currentTime = Math.floor(Date.now() / 1000);

            // Clear any existing jobs
            this.activeJobs.forEach(job => job.cancel());
            this.activeJobs.clear();

            // Schedule unmutes for all active mutes
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

            // Remove existing mute if present
            mutesData.users = mutesData.users.filter(mute => mute.userId !== userId);

            // Create muteChainId if not provided (first mute in a chain)
            if (!muteChainId) {
                muteChainId = `chain_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            }

            // Add new mute
            const muteData = {
                userId,
                guildId,
                roleId,
                muteStartTime: currentTime,
                muteEndTime,
                button_clicked: false,   // fresh mute always allows one risk attempt
                issuerId,
                muteChainId,
                usedRiskInChain: false    // reset per-mute; chain continuity tracked by muteChainId
            };

            console.log(`Mute data created:`, JSON.stringify(muteData));

            // IMPORTANT: Actually apply the mute role
            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) {
                console.error(`Guild ${guildId} not found`);
                return null;
            }

            // Fetch member and apply role with retry logic
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

            // Apply mute role with retry
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

            // Save to database and schedule unmute
            mutesData.users.push(muteData);
            await this.saveMutes(mutesData);

            // Schedule the unmute
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

        // Cancel existing job if present
        if (this.activeJobs.has(jobId)) {
            this.activeJobs.get(jobId).cancel();
        }

        // Calculate time until unmute
        const unmuteMsec = muteEndTime * 1000;
        const now = Date.now();

        if (unmuteMsec <= now) {
            // Already expired, unmute immediately
            this.executeUnmute(userId, guildId, roleId);
            return;
        }

        // Schedule the job using node-schedule
        const job = scheduleJob(new Date(unmuteMsec), () => {
            this.executeUnmute(userId, guildId, roleId);
        });

        // Store the job
        this.activeJobs.set(jobId, job);

        console.log(`Scheduled unmute for user ${userId} at ${new Date(unmuteMsec)}`);
    }

    async executeUnmute(userId, guildId, roleId) {
        try {
            // Get guild and member
            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) {
                console.error(`Guild ${guildId} not found`);
                return this.cleanupMute(userId);
            }

            // Fetch the member with retry logic
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

            // Remove role with retry logic
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

            // Clean up mute data
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

            // Remove active job
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

            // Verify the user is actually muted
            if (!interaction.member.roles.cache.has(mutedRoleId)) {
                return await interaction.followUp({
                    content: 'This button is only for muted users.',
                    ephemeral: true
                });
            }

            // Re-read mutes fresh every time to avoid stale data
            const mutesData = await this.getMutes();
            const userMute = mutesData.users.find(mute => mute.userId === interaction.user.id);

            if (!userMute) {
                return await interaction.followUp({
                    content: 'No mute data found for you.',
                    ephemeral: true
                });
            }

            console.log(`User mute data:`, JSON.stringify(userMute));

            // Block if they've already used the risk button for this mute entry
            // (covers both fail-doubled mutes and already-attempted success)
            if (userMute.button_clicked) {
                return await interaction.followUp({
                    content: 'You have already used the risk button for this mute. Wait for the next mute to try again.',
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

            // 50-50 roll
            const success = Math.random() < 0.5;
            let responseMessage;

            if (success) {
                // Capture needed values before any async cleanup
                const issuerId = userMute.issuerId;
                const muteChainId = userMute.muteChainId || `chain_${Date.now()}`;
                console.log(`Risk success - issuer: ${issuerId}, chain: ${muteChainId}`);

                // Mark button as used and risk as used in this chain before touching anything else
                userMute.button_clicked = true;
                userMute.usedRiskInChain = true;
                await this.saveMutes(mutesData);

                // Remove the mute role from the current user
                try {
                    await interaction.member.roles.remove(mutedRoleId);
                    console.log(`Successfully unmuted ${interaction.user.tag} via risk button`);
                } catch (error) {
                    console.error(`Error removing mute role via risk button:`, error);
                    return await interaction.followUp({
                        content: 'An error occurred while unmuting you. Please try again.',
                        ephemeral: true
                    });
                }

                // Clean up the current user's mute record
                await this.cleanupMute(interaction.user.id);

                // Try to return a doubled mute to the issuer
                if (issuerId && issuerId !== interaction.user.id) {
                    try {
                        const issuer = await interaction.guild.members.fetch(issuerId).catch(err => {
                            console.error(`Error fetching issuer: ${err.message}`);
                            return null;
                        });

                        console.log(`Issuer found: ${issuer ? 'Yes' : 'No'}`);

                        if (issuer && !issuer.roles.cache.has(mutedRoleId)) {
                            const doubledTime = remainingTime * 2;
                            console.log(`Returning doubled mute (${doubledTime}s) to issuer ${issuerId}`);

                            const returnMuteResult = await this.addMute(
                                issuerId,
                                interaction.guild.id,
                                mutedRoleId,
                                doubledTime,
                                interaction.user.id, // current user is now the issuer
                                muteChainId          // preserve chain so issuer gets one risk attempt
                            );

                            if (returnMuteResult) {
                                console.log(`Successfully returned mute to issuer: ${issuerId}`);
                                responseMessage = `${interaction.user} took the risk and won! <@${issuerId}> is now muted for **${Math.floor(doubledTime)} seconds**.`;
                            } else {
                                console.error(`Failed to return mute to issuer: ${issuerId}`);
                                responseMessage = `${interaction.user} took the risk and won! They are no longer muted. (Could not apply return mute to issuer)`;
                            }
                        } else {
                            if (issuer) {
                                responseMessage = `${interaction.user} took the risk and won! They are no longer muted. (Issuer is already muted)`;
                            } else {
                                responseMessage = `${interaction.user} took the risk and won! They are no longer muted. (Issuer not found)`;
                            }
                        }
                    } catch (error) {
                        console.error(`Error returning mute to issuer:`, error);
                        responseMessage = `${interaction.user} took the risk and won! They are no longer muted. (Error: ${error.message})`;
                    }
                } else {
                    if (!issuerId) {
                        console.log(`No issuer ID in mute data`);
                        responseMessage = `${interaction.user} took the risk and won! They are no longer muted.`;
                    } else {
                        console.log(`Issuer is the same as the user — skipping return mute`);
                        responseMessage = `${interaction.user} took the risk and won! They are no longer muted.`;
                    }
                }

            } else {
                // FAIL: double the remaining time and lock the button permanently for this mute
                const newDuration = remainingTime * 2;
                const newEndTime = currentTime + newDuration;

                responseMessage = `${interaction.user} took the risk and lost. Their mute is now doubled to **${Math.floor(newDuration)} seconds**. No more risks this mute!`;

                // Update the existing mute entry in-place with locked flags
                // We do NOT create a new mute entry — just extend and lock
                userMute.muteEndTime = newEndTime;
                userMute.button_clicked = true;    // prevent any further risk attempts
                userMute.usedRiskInChain = true;

                // Write the updated entry
                const freshMutes = await this.getMutes();
                const idx = freshMutes.users.findIndex(m => m.userId === interaction.user.id);
                if (idx !== -1) {
                    freshMutes.users[idx] = userMute;
                } else {
                    // Shouldn't happen, but just in case
                    freshMutes.users.push(userMute);
                }
                await this.saveMutes(freshMutes);

                // Reschedule the unmute for the new (doubled) end time
                this.scheduleMuteExpiration(userMute);
            }

            await interaction.followUp({ content: responseMessage });

        } catch (error) {
            console.error(`Error in handleRiskButton:`, error);

            try {
                const errorChannel = this.client.channels.cache.get('843413781409169412');
                const errorDetails = `
**Risk Button Error**
User: ${interaction.user.tag} (${interaction.user.id})
Channel: ${interaction.channel.name} (${interaction.channel.id})
Guild: ${interaction.guild.name} (${interaction.guild.id})
Error: \`${error.message}\`
Stack: \`\`\`${error.stack}\`\`\`
                `;

                if (errorChannel && errorChannel.isText()) {
                    await errorChannel.send({ content: errorDetails });
                } else if (interaction.channel && interaction.channel.isText()) {
                    await interaction.channel.send({ content: errorDetails });
                }

                await interaction.followUp({
                    content: 'An error occurred while processing your risk attempt. The error has been logged.',
                    ephemeral: true
                });
            } catch (followUpError) {
                console.error('Error sending error details to channel:', followUpError);
            }
        }
    }
}

module.exports = MuteManager;