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

    async addMute(userId, guildId, roleId, duration) {
        try {
            const mutesData = await this.getMutes();
            const currentTime = Math.floor(Date.now() / 1000);
            const muteEndTime = currentTime + duration;

            // Remove existing mute if present
            mutesData.users = mutesData.users.filter(mute => mute.userId !== userId);

            // Add new mute
            const muteData = {
                userId,
                guildId,
                roleId,
                muteStartTime: currentTime,
                muteEndTime,
                button_clicked: false
            };

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
                            // We don't return here as we still want to clean up the mute entry
                        }
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
            }

            // Clean up mute data
            await this.cleanupMute(userId);
        } catch (error) {
            console.error(`Error in executeUnmute:`, error);
            // Still try to clean up
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

            if (!interaction.member.roles.cache.has(mutedRoleId)) {
                return await interaction.followUp({
                    content: 'This button is only for muted users.',
                    ephemeral: true
                });
            }

            const mutesData = await this.getMutes();
            const userMute = mutesData.users.find(mute => mute.userId === interaction.user.id);

            if (!userMute) {
                return await interaction.followUp({
                    content: 'No mute data found for you.',
                    ephemeral: true
                });
            }

            if (userMute.button_clicked) {
                return await interaction.followUp({
                    content: 'You have already used the risk button for this mute.',
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

            const success = Math.random() < 0.5;
            let responseMessage;

            if (success) {
                // Unmute immediately
                await interaction.member.roles.remove(interaction.guild.roles.cache.get(mutedRoleId));
                responseMessage = `${interaction.user} took the risk and succeeded. They are no longer muted!`;

                // Mark as clicked and clean up
                userMute.button_clicked = true;
                await this.cleanupMute(interaction.user.id);
            } else {
                // Double remaining time
                const newDuration = remainingTime * 2;
                const newEndTime = currentTime + newDuration;
                responseMessage = `${interaction.user} took the risk and failed miserably. Mute duration is now doubled to **${Math.floor(newDuration)}** seconds.`;

                // Update mute and reschedule
                userMute.muteEndTime = newEndTime;
                userMute.button_clicked = true;
                mutesData.users = mutesData.users.filter(mute => mute.userId !== interaction.user.id);
                mutesData.users.push(userMute);
                await this.saveMutes(mutesData);

                // Reschedule the unmute
                this.scheduleMuteExpiration(userMute);
            }

            await interaction.followUp({ content: responseMessage });
        } catch (error) {
            console.error(`Error in handleRiskButton:`, error);

        }
    }
}

module.exports = MuteManager;