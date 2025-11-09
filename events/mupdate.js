const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Constants
const ANNOUNCEMENT_CHANNEL_ID = '833241820959473724';
const ACTIVITY_CHANNEL_ID = '1327928516662005770';
const TRANSACTION_CHANNEL_ID = '833246120389902356';
const ADMIN_CHANNEL_ID = '966598961353850910';
const DANK_MEMER_BOT_ID = '270904126974590976';

const TIER_1_ROLE_ID = '783032959350734868';
const TIER_2_ROLE_ID = '1038888209440067604';
const PRO_MAKER_ROLE_ID = '838478632451178506';

const TIER_1_REQUIREMENT = 35000000;
const TIER_2_REQUIREMENT = 70000000;

// File paths
const usersFilePath = path.join(__dirname, '../data/users.json');
const itemsFilePath = path.join(__dirname, '../data/items.json');
const statsFilePath = path.join(__dirname, '../data/stats.json');

// Load data
let usersData = require(usersFilePath);
const itemsData = require(itemsFilePath);
let statsData = fs.existsSync(statsFilePath) ? require(statsFilePath) : { totalDonations: 590000000 };
let lastMessageId = null;

// Utility functions
const saveUsersData = () => {
    fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
};

const saveStatsData = () => {
    fs.writeFileSync(statsFilePath, JSON.stringify(statsData, null, 2));
};

const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

async function findCommandUser(message) {
    try {
        if (message.interaction?.user) {
            return message.interaction.user.id;
        }

        if (message.reference) {
            const referencedMessage = await message.fetchReference().catch(() => null);
            if (referencedMessage?.interaction?.user) {
                return referencedMessage.interaction.user.id;
            }
        }

        const embed = message.embeds[0];
        if (embed?.footer?.text) {
            const userMatch = embed.footer.text.match(/<@!?(\d+)>/);
            if (userMatch) {
                return userMatch[1];
            }
        }

        return null;
    } catch (error) {
        console.error('Error in findCommandUser:', error);
        return null;
    }
}

async function getWeeklyStats(client) {
    const guild = await client.guilds.fetch(client.guilds.cache.first().id);
    const members = await guild.members.fetch();

    const tier1Users = [];
    const tier2Users = [];

    for (const [memberId, member] of members) {
        const hasTier1 = member.roles.cache.has(TIER_1_ROLE_ID);
        const hasTier2 = member.roles.cache.has(TIER_2_ROLE_ID);

        if (hasTier1 || hasTier2) {
            if (!usersData[memberId]) {
                usersData[memberId] = {
                    weeklyDonated: 0,
                    missedAmount: 0,
                    status: 'good',
                    totalDonated: 0,
                    currentTier: hasTier2 ? 2 : 1
                };
            }
        }

        const userData = usersData[memberId] || {
            weeklyDonated: 0,
            missedAmount: 0,
            status: 'good'
        };

        const requirement = hasTier2 ?
            TIER_2_REQUIREMENT :
            TIER_1_REQUIREMENT + (userData.missedAmount || 0);

        if (hasTier2) {
            tier2Users.push({
                id: memberId,
                weeklyDonated: userData.weeklyDonated || 0,
                requirement: requirement
            });
        } else if (hasTier1) {
            tier1Users.push({
                id: memberId,
                weeklyDonated: userData.weeklyDonated || 0,
                requirement: requirement
            });
        }
    }

    tier2Users.sort((a, b) => b.weeklyDonated - a.weeklyDonated);
    tier1Users.sort((a, b) => b.weeklyDonated - a.weeklyDonated);

    return { tier1Users, tier2Users };
}

async function updateStatusBoard(client) {
    try {
        const activityChannel = await client.channels.fetch(ACTIVITY_CHANNEL_ID);
        const { tier1Users, tier2Users } = await getWeeklyStats(client);

        const embed = new EmbedBuilder()
            .setTitle('<:lbtest:1064919048242090054>  Weekly Donations Leaderboard')
            .setColor('#4c00b0')
            .setTimestamp()
            .setFooter({ text: `Total Server Donations: ⏣ ${formatNumber(statsData.totalDonations)}` });

        if (tier2Users.length > 0) {
            embed.addFields({
                name: '<:streak:1064909945373458522>  Tier 2 Members',
                value: tier2Users.map((user, index) =>
                    `\`${index + 1}.\` <@${user.id}> ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)}`
                ).join('\n') || 'None'
            });
        }

        if (tier1Users.length > 0) {
            embed.addFields({
                name: '<:YJ_streak:1259258046924853421>  Tier 1 Members',
                value: tier1Users.map((user, index) =>
                    `\`${index + 1}.\` <@${user.id}> ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)}`
                ).join('\n') || 'None'
            });
        }

        const messages = await activityChannel.messages.fetch({ limit: 10 });
        const statusMessage = messages.find(m =>
            m.author.id === client.user.id &&
            m.embeds[0]?.title?.includes('Weekly Donations Leaderboard')
        );

        if (statusMessage) {
            await statusMessage.edit({ embeds: [embed] });
        } else {
            await activityChannel.send({ embeds: [embed] });
        }

        return { tier1Users, tier2Users };
    } catch (error) {
        console.error('Error updating status board:', error);
        return { tier1Users: [], tier2Users: [] };
    }
}

// Add this helper function at the top of mupdate.js, before the weeklyReset function

/**
 * Safely fetch guild members with timeout handling
 * @param {Guild} guild - Discord guild object
 * @param {number} timeout - Timeout in milliseconds (default 30000)
 * @returns {Promise<Collection>} Collection of guild members
 */
async function safelyFetchMembers(guild, timeout = 30000) {
    try {
        console.log('[RESET] Fetching guild members...');
        const members = await guild.members.fetch({
            force: true,
            time: timeout
        });
        console.log(`[RESET] Successfully fetched ${members.size} members`);
        return members;
    } catch (error) {
        console.error('[RESET] Error fetching all members, trying cache fallback:', error);
        // Fallback to cached members if fetch fails
        if (guild.members.cache.size > 0) {
            console.log(`[RESET] Using cached members: ${guild.members.cache.size} members`);
            return guild.members.cache;
        }
        throw error;
    }
}

// Then in your weeklyReset function, replace ALL instances of:
// const members = await guild.members.fetch();
// WITH:
// const members = await safelyFetchMembers(guild);

// Here's the complete updated weeklyReset function:

async function weeklyReset(client) {
    try {
        console.log('[RESET] Starting weekly reset process');

        // Explicitly reload the latest data
        try {
            if (fs.existsSync(usersFilePath)) {
                usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
                console.log('[RESET] Successfully loaded latest user data');
            } else {
                console.warn('[RESET] users.json file not found!');
            }

            if (fs.existsSync(statsFilePath)) {
                statsData = JSON.parse(fs.readFileSync(statsFilePath, 'utf8'));
                console.log('[RESET] Successfully loaded latest stats data');
            } else {
                console.warn('[RESET] stats.json file not found!');
            }
        } catch (dataLoadError) {
            console.error('[RESET] Error loading data files:', dataLoadError);
        }

        const guild = await client.guilds.fetch(client.guilds.cache.first().id);
        const announcementChannel = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
        const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID);

        const summary = {
            demotions: [],
            promotions: []
        };

        let topDonors = [];
        let topDonation = 0;
        let weeklyDonations = 0;
        const tier1Donations = [];
        const tier2Donations = [];

        // FIXED: Use safe member fetching with timeout handling
        console.log('[RESET] Fetching guild members (this may take a moment)...');
        const members = await safelyFetchMembers(guild, 45000); // 45 second timeout
        console.log('[RESET] Member fetch completed');

        for (const [memberId, member] of members) {
            const hasTier1 = member.roles.cache.has(TIER_1_ROLE_ID);
            const hasTier2 = member.roles.cache.has(TIER_2_ROLE_ID);

            if (hasTier1 || hasTier2) {
                if (!usersData[memberId]) {
                    usersData[memberId] = {
                        weeklyDonated: 0,
                        totalDonated: 0,
                        currentTier: hasTier2 ? 2 : 1,
                        lastDonation: new Date().toISOString()
                    };
                }
            }

            if (hasTier1 && !hasTier2 && usersData[memberId]?.weeklyDonated > 0) {
                tier1Donations.push({
                    id: memberId,
                    donated: usersData[memberId].weeklyDonated
                });
            }

            if (hasTier2 && usersData[memberId]?.weeklyDonated > 0) {
                tier2Donations.push({
                    id: memberId,
                    donated: usersData[memberId].weeklyDonated
                });
            }
        }

        for (const [userId, userData] of Object.entries(usersData)) {
            weeklyDonations += userData.weeklyDonated || 0;

            if (userData.weeklyDonated > topDonation) {
                topDonors = [{ id: userId, donation: userData.weeklyDonated, timestamp: userData.lastDonation || new Date().toISOString() }];
                topDonation = userData.weeklyDonated;
            } else if (userData.weeklyDonated === topDonation && topDonation > 0) {
                topDonors.push({ id: userId, donation: userData.weeklyDonated, timestamp: userData.lastDonation || new Date().toISOString() });
            }
        }

        topDonors.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const topDonor = topDonors.length > 0 ? topDonors[0].id : null;

        const { tier1Users, tier2Users } = await getWeeklyStats(client);
        const weeklyStatsEmbed = new EmbedBuilder()
            .setTitle('<:lbtest:1064919048242090054>  Weekly stats')
            .setColor('#4c00b0')
            .setDescription('Here is how our Money Makers performed this week:');

        if (tier2Users.length > 0) {
            weeklyStatsEmbed.addFields({
                name: '<:streak:1064909945373458522>  Tier 2',
                value: tier2Users.map((user, index) =>
                    `\`${index + 1}.\` <@${user.id}> ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)}`
                ).join('\n') || 'None'
            });
        }

        if (tier1Users.length > 0) {
            weeklyStatsEmbed.addFields({
                name: '<:YJ_streak:1259258046924853421>  Tier 1',
                value: tier1Users.map((user, index) =>
                    `\`${index + 1}.\` <@${user.id}> ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)}`
                ).join('\n') || 'None'
            });
        }

        let pingMessage = `<@&${TIER_1_ROLE_ID}> 
The scoreboard has now been reset! Thank you for all of your donations. We have collected ⏣ ${formatNumber(weeklyDonations)} coins this week`;

        if (statsData.totalDonations && statsData.totalDonations !== weeklyDonations) {
            pingMessage += ` making the total ⏣ ${formatNumber(statsData.totalDonations)}`;
        }

        pingMessage += `. Keep up the great work. 
Congratulations to any promoted members and good luck for the next week. 
You can now send your new requirements in <#${TRANSACTION_CHANNEL_ID}> according to your level!!`;

        await announcementChannel.send(pingMessage);
        await announcementChannel.send({ embeds: [weeklyStatsEmbed] });

        const promotionUserIds = [];

        // ISOLATED SECTION 1: Pro Maker Role Management
        try {
            console.log('[RESET] Removing existing Pro Maker roles');
            // FIXED: Reuse already fetched members instead of fetching again
            for (const [memberId, member] of members) {
                if (member.roles.cache.has(PRO_MAKER_ROLE_ID)) {
                    await member.roles.remove(PRO_MAKER_ROLE_ID);
                }
            }
        } catch (roleRemovalError) {
            console.error('[RESET] Error removing Pro Maker roles:', roleRemovalError);
            try {
                await announcementChannel.send('<:xmark:934659388386451516> There was an issue updating Pro Money Maker roles. Please notify an admin.');
            } catch (notifyError) {
                console.error('[RESET] Could not send role error notification:', notifyError);
            }
        }

        // ISOLATED SECTION 2: Top Donor Processing
        try {
            console.log('[RESET] Processing top donor');
            if (topDonor) {
                const topDonorMember = await guild.members.fetch(topDonor);
                await topDonorMember.roles.add(PRO_MAKER_ROLE_ID);
                console.log(`[RESET] Added Pro Maker role to ${topDonorMember.user.tag}`);

                const wasTie = topDonors.length > 1;
                let tieMessage = '';
                if (wasTie) {
                    tieMessage = `\n> *There was a tie for top donor! <@${topDonor}> was selected as they donated first.*`;
                }

                const topDonorEmbed = new EmbedBuilder()
                    .setTitle('<:winners:1000018706874781806>  Pro Money Maker of the Week')
                    .setColor('#4c00b0')
                    .setDescription(`> Congratulations to <@${topDonor}> for being the top donor this week with ⏣ ${formatNumber(topDonation)}! They will keep the <@&${PRO_MAKER_ROLE_ID}> role for the next week.${tieMessage}`)
                    .setTimestamp();

                await announcementChannel.send({ embeds: [topDonorEmbed] });
                console.log('[RESET] Sent top donor announcement');
            } else {
                console.log('[RESET] No top donor found this week');
            }
        } catch (topDonorError) {
            console.error('[RESET] Error processing top donor:', topDonorError);
            try {
                await announcementChannel.send(`<:xmark:934659388386451516> There was an issue announcing the Pro Money Maker of the week. ${topDonor ? `Congratulations to <@${topDonor}> with ⏣ ${formatNumber(topDonation)}!` : 'No top donor found this week.'}`);
            } catch (notifyError) {
                console.error('[RESET] Could not send top donor error notification:', notifyError);
            }
        }

        // Process promotions and demotions
        for (const [userId, userData] of Object.entries(usersData)) {
            // FIXED: Try to get member from already-fetched collection first
            let member = members.get(userId);
            if (!member) {
                // Fallback: fetch individual member if not in collection
                member = await guild.members.fetch(userId).catch(() => null);
            }
            if (!member) continue;

            const isTier2 = member.roles.cache.has(TIER_2_ROLE_ID);
            const isTier1 = member.roles.cache.has(TIER_1_ROLE_ID);

            // Promotion logic - Tier 1 to Tier 2
            if (isTier1 && !isTier2 && userData.weeklyDonated >= TIER_2_REQUIREMENT) {
                await member.roles.add(TIER_2_ROLE_ID);
                promotionUserIds.push(userId);
                summary.promotions.push({
                    userId,
                    donated: userData.weeklyDonated,
                    newTier: 2
                });
            }

            // Demotion logic - Tier 2 to Tier 1
            if (isTier2) {
                if (userData.weeklyDonated < TIER_2_REQUIREMENT) {
                    await member.roles.remove(TIER_2_ROLE_ID);
                    summary.demotions.push({
                        userId,
                        fromTier: 2,
                        toTier: 1,
                        missedBy: TIER_2_REQUIREMENT - userData.weeklyDonated
                    });

                    try {
                        const demotionEmbed = new EmbedBuilder()
                            .setTitle('<:xmark:934659388386451516> Weekly Requirement Not Met')
                            .setColor('#ff0000')
                            .setDescription(`You didn't meet this week's Tier 2 requirement.\n\nYou have been demoted to Tier 1 and will start fresh with the standard Tier 1 requirement of ⏣ ${formatNumber(TIER_1_REQUIREMENT)}.`)
                            .setTimestamp();
                        await member.send({ embeds: [demotionEmbed] });
                    } catch (error) {
                        console.error(`Failed to send demotion DM to ${userId}`);
                    }
                }
            }
            // Demotion logic - Tier 1 to No Role
            else if (isTier1) {
                if (userData.weeklyDonated < TIER_1_REQUIREMENT) {
                    await member.roles.remove(TIER_1_ROLE_ID);
                    summary.demotions.push({
                        userId,
                        fromTier: 1,
                        toTier: 0,
                        missedBy: TIER_1_REQUIREMENT - userData.weeklyDonated
                    });

                    try {
                        const demotionEmbed = new EmbedBuilder()
                            .setTitle('<:xmark:934659388386451516> Weekly Requirement Not Met')
                            .setColor('#ff0000')
                            .setDescription(`You missed Tier 1 requirement by ⏣ ${formatNumber(TIER_1_REQUIREMENT - userData.weeklyDonated)}.\n\nYou have been removed from the Money Makers team. If you wish to rejoin, please wait for a week and then DM faiz to restart at Tier 1.`)
                            .setTimestamp();

                        await member.send({ embeds: [demotionEmbed] });
                    } catch (error) {
                        console.error(`Failed to send demotion DM to ${userId}`);
                    }

                    delete usersData[userId];
                }
            }

            userData.weeklyDonated = 0;
        }

        if (promotionUserIds.length > 0) {
            const promotionEmbed = new EmbedBuilder()
                .setTitle('<:power:1064835342160625784>  Promotions')
                .setColor('#4c00b0')
                .setDescription(
                    "These users have fulfilled the requirement to move up a level. They are promoted to tier 2\n\n" +
                    promotionUserIds.map(id => `<:aquadot:860074237954883585> <@${id}>`).join('\n')
                )
                .setTimestamp();
            await announcementChannel.send({ embeds: [promotionEmbed] });
        }

        // Create donation syntaxes
        const donationSyntaxes = [];

        tier1Donations
            .filter(donation => donation.donated > 0)
            .forEach(donation => {
                donationSyntaxes.push(`/dono add user: ${donation.id} amount: ${formatNumber(donation.donated)}`);
            });

        tier2Donations
            .filter(donation => donation.donated > 0)
            .forEach(donation => {
                donationSyntaxes.push(`/dono add user: ${donation.id} amount: ${formatNumber(Math.floor(donation.donated * 1.25))}`);
            });

        // Create admin summary embed
        const summaryEmbed = new EmbedBuilder()
            .setTitle('<:lbtest:1064919048242090054> Weekly Reset Summary')
            .setColor('#4c00b0')
            .setTimestamp();

        summaryEmbed.addFields({
            name: '📊 Weekly Statistics',
            value: `Total Weekly Donations: ⏣ ${formatNumber(weeklyDonations)}\nTotal Server Donations: ⏣ ${formatNumber(statsData.totalDonations)}`
        });

        if (tier2Users.length > 0) {
            summaryEmbed.addFields({
                name: '<:streak:1064909945373458522> Tier 2 Weekly Performance',
                value: tier2Users.map((user, index) =>
                    `\`${index + 1}.\` <@${user.id}> ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)}`
                ).join('\n') || 'None'
            });
        }

        if (tier1Users.length > 0) {
            summaryEmbed.addFields({
                name: '<:YJ_streak:1259258046924853421> Tier 1 Weekly Performance',
                value: tier1Users.map((user, index) =>
                    `\`${index + 1}.\` <@${user.id}> ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)}`
                ).join('\n') || 'None'
            });
        }

        if (summary.demotions.length > 0) {
            summaryEmbed.addFields({
                name: '<:xmark:934659388386451516> Demotions',
                value: summary.demotions.map(d =>
                    `> <@${d.userId}> (Tier ${d.fromTier} → ${d.toTier})\n> Missed by ⏣ ${formatNumber(d.missedBy)}`
                ).join('\n\n')
            });
        }

        if (summary.promotions.length > 0) {
            summaryEmbed.addFields({
                name: '<:purpledot:860074414853586984>  Promotions',
                value: summary.promotions.map(p =>
                    `> <@${p.userId}> → Tier ${p.newTier}\n> Donated: ⏣ ${formatNumber(p.donated)}`
                ).join('\n\n')
            });
        }

        await adminChannel.send({ embeds: [summaryEmbed] });

        if (donationSyntaxes.length > 0) {
            const donationEmbed = new EmbedBuilder()
                .setTitle('<:purpledot:860074414853586984> Donation Logging Syntaxes')
                .setColor('#4c00b0')
                .setDescription('Use these commands to log donations:\n*Tier 1: Original amount | Tier 2: 1.25x multiplier*')
                .addFields({
                    name: 'Commands',
                    value: donationSyntaxes.join('\n')
                })
                .setTimestamp();

            await adminChannel.send({ embeds: [donationEmbed] });
        }

        // ISOLATED SECTION 3: Data Saving
        try {
            console.log('[RESET] Saving stats and user data');
            saveStatsData();
            saveUsersData();
            console.log('[RESET] Data saved successfully');
        } catch (saveError) {
            console.error('[RESET] Error saving data:', saveError);
            try {
                await adminChannel.send('<:xmark:934659388386451516> There was an error saving the data during weekly reset. Please check the logs and verify data integrity.');
            } catch (notifyError) {
                console.error('[RESET] Could not send data save error notification:', notifyError);
            }
        }

        // ISOLATED SECTION 4: Activity Board Update
        try {
            console.log('[RESET] Updating activity board - deleting old and sending new');
            const activityChannel = await client.channels.fetch(ACTIVITY_CHANNEL_ID);

            const messages = await activityChannel.messages.fetch({ limit: 10 });
            const oldStatusMessage = messages.find(m =>
                m.author.id === client.user.id &&
                m.embeds[0]?.title?.includes('Weekly Donations Leaderboard')
            );

            if (oldStatusMessage) {
                await oldStatusMessage.delete();
                console.log('[RESET] Deleted old status board message');
            }

            await updateStatusBoard(client);
            console.log('[RESET] Sent new status board message');
        } catch (statusError) {
            console.error('[RESET] Error updating status board:', statusError);
            try {
                await adminChannel.send('<:xmark:934659388386451516> There was an error updating the status board during weekly reset.');
            } catch (notifyError) {
                console.error('[RESET] Could not send status board error notification:', notifyError);
            }
        }

        console.log('[RESET] Weekly reset completed successfully');
        return true;
    } catch (error) {
        console.error('[RESET] Critical error in weekly reset:', error);
        try {
            const errorChannel = await client.channels.fetch(ADMIN_CHANNEL_ID);
            await errorChannel.send('<:xmark:934659388386451516> **CRITICAL ERROR DURING WEEKLY RESET**\nThe weekly reset encountered a critical error. Please check the logs and may need to run a manual reset.');
        } catch (notifyError) {
            console.error('[RESET] Could not send critical error notification:', notifyError);
        }
        return false;
    }
}

async function weeklyReset(client) {
    try {
        console.log('[RESET] Starting weekly reset process');

        // Explicitly reload the latest data
        try {
            if (fs.existsSync(usersFilePath)) {
                usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
                console.log('[RESET] Successfully loaded latest user data');
            } else {
                console.warn('[RESET] users.json file not found!');
            }

            if (fs.existsSync(statsFilePath)) {
                statsData = JSON.parse(fs.readFileSync(statsFilePath, 'utf8'));
                console.log('[RESET] Successfully loaded latest stats data');
            } else {
                console.warn('[RESET] stats.json file not found!');
            }
        } catch (dataLoadError) {
            console.error('[RESET] Error loading data files:', dataLoadError);
        }

        const guild = await client.guilds.fetch(client.guilds.cache.first().id);
        const announcementChannel = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
        const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID);

        const summary = {
            demotions: [],
            promotions: []
        };

        // Changed to array to track all potential top donors
        let topDonors = [];
        let topDonation = 0;
        let weeklyDonations = 0;
        const tier1Donations = [];
        const tier2Donations = [];

        const members = await guild.members.fetch();
        for (const [memberId, member] of members) {
            const hasTier1 = member.roles.cache.has(TIER_1_ROLE_ID);
            const hasTier2 = member.roles.cache.has(TIER_2_ROLE_ID);

            if (hasTier1 || hasTier2) {
                if (!usersData[memberId]) {
                    usersData[memberId] = {
                        weeklyDonated: 0,
                        totalDonated: 0,
                        currentTier: hasTier2 ? 2 : 1,
                        lastDonation: new Date().toISOString()
                    };
                }
            }

            if (hasTier1 && !hasTier2 && usersData[memberId]?.weeklyDonated > 0) {
                tier1Donations.push({
                    id: memberId,
                    donated: usersData[memberId].weeklyDonated
                });
            }

            if (hasTier2 && usersData[memberId]?.weeklyDonated > 0) {
                tier2Donations.push({
                    id: memberId,
                    donated: usersData[memberId].weeklyDonated
                });
            }
        }

        for (const [userId, userData] of Object.entries(usersData)) {
            weeklyDonations += userData.weeklyDonated || 0;

            // Track all top donors in case of ties
            if (userData.weeklyDonated > topDonation) {
                // New highest donation, clear previous top donors
                topDonors = [{ id: userId, donation: userData.weeklyDonated, timestamp: userData.lastDonation || new Date().toISOString() }];
                topDonation = userData.weeklyDonated;
            } else if (userData.weeklyDonated === topDonation && topDonation > 0) {
                // Tie with current top donation, add to array
                topDonors.push({ id: userId, donation: userData.weeklyDonated, timestamp: userData.lastDonation || new Date().toISOString() });
            }
        }

        // Sort top donors by timestamp (earliest first) in case of ties
        topDonors.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // First in array is the earliest donor with highest amount
        const topDonor = topDonors.length > 0 ? topDonors[0].id : null;

        const { tier1Users, tier2Users } = await getWeeklyStats(client);
        const weeklyStatsEmbed = new EmbedBuilder()
            .setTitle('<:lbtest:1064919048242090054>  Weekly stats')
            .setColor('#4c00b0')
            .setDescription('Here is how our Money Makers performed this week:');

        if (tier2Users.length > 0) {
            weeklyStatsEmbed.addFields({
                name: '<:streak:1064909945373458522>  Tier 2',
                value: tier2Users.map((user, index) =>
                    `\`${index + 1}.\` <@${user.id}> ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)}`
                ).join('\n') || 'None'
            });
        }

        if (tier1Users.length > 0) {
            weeklyStatsEmbed.addFields({
                name: '<:YJ_streak:1259258046924853421>  Tier 1',
                value: tier1Users.map((user, index) =>
                    `\`${index + 1}.\` <@${user.id}> ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)}`
                ).join('\n') || 'None'
            });
        }

        let pingMessage = `<@&${TIER_1_ROLE_ID}> 
The scoreboard has now been reset! Thank you for all of your donations. We have collected ⏣ ${formatNumber(weeklyDonations)} coins this week`;

        if (statsData.totalDonations && statsData.totalDonations !== weeklyDonations) {
            pingMessage += ` making the total ⏣ ${formatNumber(statsData.totalDonations)}`;
        }

        pingMessage += `. Keep up the great work. 
Congratulations to any promoted members and good luck for the next week. 
You can now send your new requirements in <#${TRANSACTION_CHANNEL_ID}> according to your level!!`;

        await announcementChannel.send(pingMessage);
        await announcementChannel.send({ embeds: [weeklyStatsEmbed] });

        const promotionUserIds = [];

        // ISOLATED SECTION 1: Pro Maker Role Management
        try {
            console.log('[RESET] Removing existing Pro Maker roles');
            const currentProMakerMembers = await guild.members.fetch();
            for (const [memberId, member] of currentProMakerMembers) {
                if (member.roles.cache.has(PRO_MAKER_ROLE_ID)) {
                    await member.roles.remove(PRO_MAKER_ROLE_ID);
                }
            }
        } catch (roleRemovalError) {
            console.error('[RESET] Error removing Pro Maker roles:', roleRemovalError);
            try {
                await announcementChannel.send('<:xmark:934659388386451516> There was an issue updating Pro Money Maker roles. Please notify an admin.');
            } catch (notifyError) {
                console.error('[RESET] Could not send role error notification:', notifyError);
            }
        }

        // ISOLATED SECTION 2: Top Donor Processing
        try {
            console.log('[RESET] Processing top donor');
            if (topDonor) {
                const topDonorMember = await guild.members.fetch(topDonor);
                await topDonorMember.roles.add(PRO_MAKER_ROLE_ID);
                console.log(`[RESET] Added Pro Maker role to ${topDonorMember.user.tag}`);

                // If there was a tie, mention it in the announcement
                const wasTie = topDonors.length > 1;
                let tieMessage = '';
                if (wasTie) {
                    tieMessage = `\n> *There was a tie for top donor! <@${topDonor}> was selected as they donated first.*`;
                }

                const topDonorEmbed = new EmbedBuilder()
                    .setTitle('<:winners:1000018706874781806>  Pro Money Maker of the Week')
                    .setColor('#4c00b0')
                    .setDescription(`> Congratulations to <@${topDonor}> for being the top donor this week with ⏣ ${formatNumber(topDonation)}! They will keep the <@&${PRO_MAKER_ROLE_ID}> role for the next week.${tieMessage}`)
                    .setTimestamp();

                await announcementChannel.send({ embeds: [topDonorEmbed] });
                console.log('[RESET] Sent top donor announcement');
            } else {
                console.log('[RESET] No top donor found this week');
            }
        } catch (topDonorError) {
            console.error('[RESET] Error processing top donor:', topDonorError);
            try {
                await announcementChannel.send(`<:xmark:934659388386451516> There was an issue announcing the Pro Money Maker of the week. ${topDonor ? `Congratulations to <@${topDonor}> with ⏣ ${formatNumber(topDonation)}!` : 'No top donor found this week.'}`);
            } catch (notifyError) {
                console.error('[RESET] Could not send top donor error notification:', notifyError);
            }
        }

        for (const [userId, userData] of Object.entries(usersData)) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) continue;

            const isTier2 = member.roles.cache.has(TIER_2_ROLE_ID);
            const isTier1 = member.roles.cache.has(TIER_1_ROLE_ID);

            // Promotion logic - Tier 1 to Tier 2
            if (isTier1 && !isTier2 && userData.weeklyDonated >= TIER_2_REQUIREMENT) {
                await member.roles.add(TIER_2_ROLE_ID);
                promotionUserIds.push(userId);
                summary.promotions.push({
                    userId,
                    donated: userData.weeklyDonated,
                    newTier: 2
                });
            }

            // Demotion logic - Tier 2 to Tier 1
            if (isTier2) {
                if (userData.weeklyDonated < TIER_2_REQUIREMENT) {
                    await member.roles.remove(TIER_2_ROLE_ID);
                    summary.demotions.push({
                        userId,
                        fromTier: 2,
                        toTier: 1,
                        missedBy: TIER_2_REQUIREMENT - userData.weeklyDonated
                    });

                    try {
                        const demotionEmbed = new EmbedBuilder()
                            .setTitle('<:xmark:934659388386451516> Weekly Requirement Not Met')
                            .setColor('#ff0000')
                            .setDescription(`You didn't meet this week's Tier 2 requirement.\n\nYou have been demoted to Tier 1 and will start fresh with the standard Tier 1 requirement of ⏣ ${formatNumber(TIER_1_REQUIREMENT)}.`)
                            .setTimestamp();
                        await member.send({ embeds: [demotionEmbed] });
                    } catch (error) {
                        console.error(`Failed to send demotion DM to ${userId}`);
                    }
                }
            }
            // Demotion logic - Tier 1 to No Role
            else if (isTier1) {
                if (userData.weeklyDonated < TIER_1_REQUIREMENT) {
                    await member.roles.remove(TIER_1_ROLE_ID);
                    summary.demotions.push({
                        userId,
                        fromTier: 1,
                        toTier: 0,
                        missedBy: TIER_1_REQUIREMENT - userData.weeklyDonated
                    });

                    try {
                        const demotionEmbed = new EmbedBuilder()
                            .setTitle('<:xmark:934659388386451516> Weekly Requirement Not Met')
                            .setColor('#ff0000')
                            .setDescription(`You missed Tier 1 requirement by ⏣ ${formatNumber(TIER_1_REQUIREMENT - userData.weeklyDonated)}.\n\nYou have been removed from the Money Makers team. If you wish to rejoin, please wait for a week and then DM faiz to restart at Tier 1.`)
                            .setTimestamp();

                        await member.send({ embeds: [demotionEmbed] });
                    } catch (error) {
                        console.error(`Failed to send demotion DM to ${userId}`);
                    }

                    delete usersData[userId];
                }
            }

            userData.weeklyDonated = 0;
        }

        if (promotionUserIds.length > 0) {
            const promotionEmbed = new EmbedBuilder()
                .setTitle('<:power:1064835342160625784>  Promotions')
                .setColor('#4c00b0')
                .setDescription(
                    "These users have fulfilled the requirement to move up a level. They are promoted to tier 2\n\n" +
                    promotionUserIds.map(id => `<:aquadot:860074237954883585> <@${id}>`).join('\n')
                )
                .setTimestamp();
            await announcementChannel.send({ embeds: [promotionEmbed] });
        }

        // Create donation syntaxes for both tiers
        const donationSyntaxes = [];

        // Add Tier 1 donations (no multiplier)
        tier1Donations
            .filter(donation => donation.donated > 0)
            .forEach(donation => {
                donationSyntaxes.push(`/dono add user: ${donation.id} amount: ${formatNumber(donation.donated)}`);
            });

        // Add Tier 2 donations (1.25x multiplier)
        tier2Donations
            .filter(donation => donation.donated > 0)
            .forEach(donation => {
                donationSyntaxes.push(`/dono add user: ${donation.id} amount: ${formatNumber(Math.floor(donation.donated * 1.25))}`);
            });

        // Create admin summary embed with weekly stats included
        const summaryEmbed = new EmbedBuilder()
            .setTitle('<:lbtest:1064919048242090054> Weekly Reset Summary')
            .setColor('#4c00b0')
            .setTimestamp();

        summaryEmbed.addFields({
            name: '📊 Weekly Statistics',
            value: `Total Weekly Donations: ⏣ ${formatNumber(weeklyDonations)}\nTotal Server Donations: ⏣ ${formatNumber(statsData.totalDonations)}`
        });

        // Add the weekly stats fields to the admin summary (same as announcement)
        if (tier2Users.length > 0) {
            summaryEmbed.addFields({
                name: '<:streak:1064909945373458522> Tier 2 Weekly Performance',
                value: tier2Users.map((user, index) =>
                    `\`${index + 1}.\` <@${user.id}> ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)}`
                ).join('\n') || 'None'
            });
        }

        if (tier1Users.length > 0) {
            summaryEmbed.addFields({
                name: '<:YJ_streak:1259258046924853421> Tier 1 Weekly Performance',
                value: tier1Users.map((user, index) =>
                    `\`${index + 1}.\` <@${user.id}> ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)}`
                ).join('\n') || 'None'
            });
        }

        if (summary.demotions.length > 0) {
            summaryEmbed.addFields({
                name: '<:xmark:934659388386451516> Demotions',
                value: summary.demotions.map(d =>
                    `> <@${d.userId}> (Tier ${d.fromTier} → ${d.toTier})\n> Missed by ⏣ ${formatNumber(d.missedBy)}`
                ).join('\n\n')
            });
        }

        if (summary.promotions.length > 0) {
            summaryEmbed.addFields({
                name: '<:purpledot:860074414853586984>  Promotions',
                value: summary.promotions.map(p =>
                    `> <@${p.userId}> → Tier ${p.newTier}\n> Donated: ⏣ ${formatNumber(p.donated)}`
                ).join('\n\n')
            });
        }

        // Send the main summary embed
        await adminChannel.send({ embeds: [summaryEmbed] });

        // Send donation syntaxes in a separate embed if there are any
        if (donationSyntaxes.length > 0) {
            const donationEmbed = new EmbedBuilder()
                .setTitle('<:purpledot:860074414853586984> Donation Logging Syntaxes')
                .setColor('#4c00b0')
                .setDescription('Use these commands to log donations:\n*Tier 1: Original amount | Tier 2: 1.25x multiplier*')
                .addFields({
                    name: 'Commands',
                    value: donationSyntaxes.join('\n')
                })
                .setTimestamp();

            await adminChannel.send({ embeds: [donationEmbed] });
        }

        // ISOLATED SECTION 3: Data Saving
        try {
            console.log('[RESET] Saving stats and user data');
            saveStatsData();
            saveUsersData();
            console.log('[RESET] Data saved successfully');
        } catch (saveError) {
            console.error('[RESET] Error saving data:', saveError);
            try {
                await adminChannel.send('<:xmark:934659388386451516> There was an error saving the data during weekly reset. Please check the logs and verify data integrity.');
            } catch (notifyError) {
                console.error('[RESET] Could not send data save error notification:', notifyError);
            }
        }

        // ISOLATED SECTION 4: Activity Board Update (Delete old and send new)
        try {
            console.log('[RESET] Updating activity board - deleting old and sending new');
            const activityChannel = await client.channels.fetch(ACTIVITY_CHANNEL_ID);

            // Delete old status board message
            const messages = await activityChannel.messages.fetch({ limit: 10 });
            const oldStatusMessage = messages.find(m =>
                m.author.id === client.user.id &&
                m.embeds[0]?.title?.includes('Weekly Donations Leaderboard')
            );

            if (oldStatusMessage) {
                await oldStatusMessage.delete();
                console.log('[RESET] Deleted old status board message');
            }

            // Send fresh status board
            await updateStatusBoard(client);
            console.log('[RESET] Sent new status board message');
        } catch (statusError) {
            console.error('[RESET] Error updating status board:', statusError);
            try {
                await adminChannel.send('<:xmark:934659388386451516> There was an error updating the status board during weekly reset.');
            } catch (notifyError) {
                console.error('[RESET] Could not send status board error notification:', notifyError);
            }
        }

        console.log('[RESET] Weekly reset completed successfully');
        return true;
    } catch (error) {
        console.error('[RESET] Critical error in weekly reset:', error);
        try {
            const errorChannel = await client.channels.fetch(ADMIN_CHANNEL_ID);
            await errorChannel.send('<:xmark:934659388386451516> **CRITICAL ERROR DURING WEEKLY RESET**\nThe weekly reset encountered a critical error. Please check the logs and may need to run a manual reset.');
        } catch (notifyError) {
            console.error('[RESET] Could not send critical error notification:', notifyError);
        }
        return false;
    }
}





module.exports = {
    name: Events.MessageUpdate,
    weeklyReset,
    async execute(client, oldMessage, newMessage) {
        try {
            if (oldMessage.content && newMessage.content && oldMessage.content !== newMessage.content) {
                const channelId = newMessage.channel.id;
                const messageData = {
                    author: newMessage.author.tag,
                    oldContent: oldMessage.content,
                    newContent: newMessage.content,
                    timestamp: Math.floor(Date.now() / 1000),
                    messageId: newMessage.id
                };

                if (!client.editedMessages) {
                    client.editedMessages = new Map();
                }

                if (!client.editedMessages.has(channelId)) {
                    client.editedMessages.set(channelId, []);
                }

                const channelMessages = client.editedMessages.get(channelId);
                if (channelMessages.length >= 50) {
                    channelMessages.shift();
                }
                channelMessages.push(messageData);
            }

            if (newMessage.channel?.id === TRANSACTION_CHANNEL_ID &&
                newMessage.author?.id === DANK_MEMER_BOT_ID) {

                if (!newMessage.embeds?.length) return;

                const embed = newMessage.embeds[0];
                if (!embed.description?.includes('Successfully donated')) return;

                const donationMatch = embed.description.match(/Successfully donated \*\*⏣\s*([\d,]+)\*\*/);
                if (!donationMatch) return;

                const donationAmount = parseInt(donationMatch[1].replace(/,/g, ''), 10);
                const donorId = await findCommandUser(newMessage);
                if (!donorId) return;

                const guild = await client.guilds.fetch(client.guilds.cache.first().id);
                const member = await guild.members.fetch(donorId);

                // Immediately update user data and save
                if (!usersData[donorId]) {
                    usersData[donorId] = {
                        totalDonated: donationAmount,
                        weeklyDonated: donationAmount,
                        currentTier: member.roles.cache.has(TIER_2_ROLE_ID) ? 2 :
                            (member.roles.cache.has(TIER_1_ROLE_ID) ? 1 : 0),
                        status: 'good',
                        missedAmount: 0,
                        lastDonation: new Date().toISOString()
                    };
                } else {
                    usersData[donorId].totalDonated = (usersData[donorId].totalDonated || 0) + donationAmount;
                    usersData[donorId].weeklyDonated = (usersData[donorId].weeklyDonated || 0) + donationAmount;
                    usersData[donorId].lastDonation = new Date().toISOString();
                    usersData[donorId].currentTier = member.roles.cache.has(TIER_2_ROLE_ID) ? 2 :
                        (member.roles.cache.has(TIER_1_ROLE_ID) ? 1 : 0);
                }

                // Immediately save data
                statsData.totalDonations += donationAmount;
                saveStatsData();
                saveUsersData();

                // Send donation embed immediately
                const requirement = usersData[donorId].currentTier === 2 ?
                    TIER_2_REQUIREMENT : TIER_1_REQUIREMENT;

                const donationEmbed = new EmbedBuilder()
                    .setTitle('<:prize:1000016483369369650>  New Donation')
                    .setColor('#4c00b0')
                    .setDescription(`<@${donorId}> donated ⏣ ${formatNumber(donationAmount)}\n\n<:purpledot:860074414853586984>  Weekly Progress: ⏣ ${formatNumber(usersData[donorId].weeklyDonated)}/${formatNumber(requirement + (usersData[donorId].missedAmount || 0))}`)
                    .setTimestamp();

                await newMessage.channel.send({ embeds: [donationEmbed] });

                // Update status board in the background
                setImmediate(() => {
                    updateStatusBoard(client).catch(console.error);
                });
            }

            if (newMessage.id === '1315178334325571635') {
                const embed = newMessage.embeds[0];
                if (!embed) return;

                const description = embed.description || embed.data?.description;
                if (!description) return;

                const winningsMatch = description.match(/Winnings:\s\*\*⏣\s([-\d,]+)\*\*/);
                if (!winningsMatch) return;

                const winningsAmount = parseInt(winningsMatch[1].replace(/,/g, ''));
                const count = winningsAmount < 0 ? -1 : +1;

                try {
                    if (!lastMessageId) {
                        const sent = await newMessage.channel.send(`Count: ${count}`);
                        lastMessageId = sent.id;
                    } else {
                        try {
                            const messageToEdit = await newMessage.channel.messages.fetch(lastMessageId);
                            const currentCount = parseInt(messageToEdit.content.split(': ')[1]);
                            await messageToEdit.edit(`Count: ${currentCount + count}`);
                        } catch (err) {
                            const sent = await newMessage.channel.send(`Count: ${count}`);
                            lastMessageId = sent.id;
                        }
                    }
                } catch (error) {
                    console.error('Error handling tracking message:', error);
                }
            }
        } catch (error) {
            console.error('Error in messageUpdate event:', error);
        }
    }
};