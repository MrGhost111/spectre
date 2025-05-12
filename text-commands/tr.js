const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Updated Constants with the correct IDs and requirements
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

// Path to data files
const usersFilePath = path.join(__dirname, '../data/users.json');
const itemsFilePath = path.join(__dirname, '../data/items.json');
const statsFilePath = path.join(__dirname, '../data/stats.json');

// Helper function for number formatting
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Get weekly stats function
async function getWeeklyStats(client, guild) {
    try {
        // Load the user data
        const usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));

        const tier1Users = [];
        const tier2Users = [];

        // Get the guild members
        const members = await guild.members.fetch();

        for (const [userId, userData] of Object.entries(usersData)) {
            // Skip users with no weekly donations
            if (!userData.weeklyDonated) continue;

            const member = members.get(userId);
            if (!member) continue;

            const userInfo = {
                id: userId,
                weeklyDonated: userData.weeklyDonated,
                requirement: 0
            };

            if (member.roles.cache.has(TIER_2_ROLE_ID)) {
                userInfo.requirement = TIER_2_REQUIREMENT;
                tier2Users.push(userInfo);
            } else if (member.roles.cache.has(TIER_1_ROLE_ID)) {
                userInfo.requirement = TIER_1_REQUIREMENT;
                tier1Users.push(userInfo);
            }
        }

        // Sort users by weekly donation (highest first)
        tier1Users.sort((a, b) => b.weeklyDonated - a.weeklyDonated);
        tier2Users.sort((a, b) => b.weeklyDonated - a.weeklyDonated);

        return { tier1Users, tier2Users };
    } catch (error) {
        console.error('Error getting weekly stats:', error);
        return { tier1Users: [], tier2Users: [] };
    }
}

module.exports = {
    name: 'testreset',
    aliases: ['tr', 'simreset'],
    description: 'Test the weekly reset process without affecting real data',
    async execute(client, message, args) {
        // Safeguard against undefined objects
        if (!message || !message.channel) {
            console.error('Message or message.channel is undefined in testreset command');
            return;
        }

        try {
            // Handle DM case or missing member case
            if (!message.guild || !message.member) {
                return await message.channel.send('This command can only be used in a server by an administrator.');
            }

            // Check for admin permissions
            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return await message.channel.send('You need administrator permissions to use this command.');
            }

            const channel = message.channel;

            await channel.send('🧪 **TEST MODE** - Starting weekly reset simulation. This will NOT affect any real data or roles.');
            await channel.send('Loading data and calculating results...');

            // Load the current data
            let usersData = {};
            let statsData = {};

            try {
                if (fs.existsSync(usersFilePath)) {
                    usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
                    await channel.send('✅ Successfully loaded user data');
                } else {
                    await channel.send('⚠️ users.json file not found! Using empty data for simulation.');
                }

                if (fs.existsSync(statsFilePath)) {
                    statsData = JSON.parse(fs.readFileSync(statsFilePath, 'utf8'));
                    await channel.send('✅ Successfully loaded stats data');
                } else {
                    await channel.send('⚠️ stats.json file not found! Using empty data for simulation.');
                }
            } catch (dataLoadError) {
                await channel.send(`❌ Error loading data files: ${dataLoadError.message}`);
                return;
            }

            const guild = message.guild;

            // Make sure guild exists
            if (!guild) {
                return await channel.send('Unable to access guild information. This command must be run in a server.');
            }

            const summary = {
                demotions: [],
                promotions: []
            };

            let topDonor = null;
            let topDonation = 0;
            let weeklyDonations = 0;
            const tier2Donations = [];

            // Calculate weekly summary
            await channel.send('📊 Analyzing member data and calculating promotions/demotions...');

            const members = await guild.members.fetch();
            for (const [memberId, member] of members) {
                const hasTier1 = member.roles.cache.has(TIER_1_ROLE_ID);
                const hasTier2 = member.roles.cache.has(TIER_2_ROLE_ID);

                if (hasTier1 || hasTier2) {
                    if (!usersData[memberId]) {
                        usersData[memberId] = {
                            weeklyDonated: 0,
                            totalDonated: 0,
                            currentTier: hasTier2 ? 2 : 1
                        };
                    }
                }

                if (hasTier2 && usersData[memberId]?.weeklyDonated > 0) {
                    tier2Donations.push({
                        id: memberId,
                        donated: usersData[memberId].weeklyDonated
                    });
                }
            }

            // Find top donor and calculate total donations
            for (const [userId, userData] of Object.entries(usersData)) {
                weeklyDonations += userData.weeklyDonated || 0;
                if (userData.weeklyDonated > topDonation) {
                    topDonor = userId;
                    topDonation = userData.weeklyDonated;
                }
            }

            // Simulate promotions/demotions without actually changing roles
            for (const [userId, userData] of Object.entries(usersData)) {
                try {
                    const member = members.get(userId);
                    if (!member) continue;

                    const isTier2 = member.roles.cache.has(TIER_2_ROLE_ID);
                    const isTier1 = member.roles.cache.has(TIER_1_ROLE_ID);

                    // Promotion logic - Tier 1 to Tier 2 (simulated)
                    if (isTier1 && !isTier2 && userData.weeklyDonated >= TIER_2_REQUIREMENT) {
                        summary.promotions.push({
                            userId,
                            donated: userData.weeklyDonated,
                            newTier: 2
                        });
                    }

                    // Demotion logic - Tier 2 to Tier 1 (simulated)
                    if (isTier2) {
                        if (userData.weeklyDonated < TIER_2_REQUIREMENT) {
                            summary.demotions.push({
                                userId,
                                fromTier: 2,
                                toTier: 1,
                                missedBy: TIER_2_REQUIREMENT - userData.weeklyDonated
                            });
                        }
                    }
                    // Demotion logic - Tier 1 to No Role (simulated)
                    else if (isTier1) {
                        if (userData.weeklyDonated < TIER_1_REQUIREMENT) {
                            summary.demotions.push({
                                userId,
                                fromTier: 1,
                                toTier: 0,
                                missedBy: TIER_1_REQUIREMENT - userData.weeklyDonated
                            });
                        }
                    }
                } catch (memberError) {
                    await channel.send(`⚠️ Error processing member ${userId}: ${memberError.message}`);
                }
            }

            // Get weekly stats
            const { tier1Users, tier2Users } = await getWeeklyStats(client, guild);

            // Simulate all the messages that would be sent
            await channel.send('🔄 Generating result messages that would be sent in a real reset...');

            // Separator for clarity
            await channel.send('▬▬▬▬▬▬▬▬▬▬ 📢 ANNOUNCEMENT CHANNEL MESSAGES ▬▬▬▬▬▬▬▬▬▬');

            // Weekly stats embed
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

            await channel.send(pingMessage);
            await channel.send({ embeds: [weeklyStatsEmbed] });

            // Top donor message
            if (topDonor) {
                const topDonorEmbed = new EmbedBuilder()
                    .setTitle('<:winners:1000018706874781806>  Pro Money Maker of the Week')
                    .setColor('#4c00b0')
                    .setDescription(`> Congratulations to <@${topDonor}> for being the top donor this week with ⏣ ${formatNumber(topDonation)}! They will keep the <@&${PRO_MAKER_ROLE_ID}> role for the next week.`)
                    .setTimestamp();

                await channel.send({ embeds: [topDonorEmbed] });
            }

            // Promotions message (if any)
            const promotionUserIds = summary.promotions.map(p => p.userId);
            if (promotionUserIds.length > 0) {
                const promotionEmbed = new EmbedBuilder()
                    .setTitle('<:power:1064835342160625784>  Promotions')
                    .setColor('#4c00b0')
                    .setDescription(
                        "These users have fulfilled the requirement to move up a level. They are promoted to tier 2\n\n" +
                        promotionUserIds.map(id => `<:aquadot:860074237954883585> <@${id}>`).join('\n')
                    )
                    .setTimestamp();
                await channel.send({ embeds: [promotionEmbed] });
            }

            // Separator for clarity
            await channel.send('▬▬▬▬▬▬▬▬▬▬ 👑 ADMIN CHANNEL MESSAGES ▬▬▬▬▬▬▬▬▬▬');

            // Summary embed for admin channel
            const tier2DonationsList = tier2Donations
                .filter(donation => donation.donated > 0)
                .map(donation => `/dono add user: <@${donation.id}> amount: ${formatNumber(Math.floor(donation.donated * 1.25))}`)
                .join('\n');

            const summaryEmbed = new EmbedBuilder()
                .setTitle('<:lbtest:1064919048242090054> Weekly Reset Summary')
                .setColor('#4c00b0')
                .setTimestamp();

            summaryEmbed.addFields({
                name: '📊 Weekly Statistics',
                value: `Total Weekly Donations: ⏣ ${formatNumber(weeklyDonations)}\nTotal Server Donations: ⏣ ${formatNumber(statsData.totalDonations || 0)}`
            });

            // Add the same weekly stats embed fields to the summary embed
            summaryEmbed.addFields([...weeklyStatsEmbed.data.fields]);

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

            if (tier2DonationsList) {
                summaryEmbed.addFields({
                    name: '<:purpledot:860074414853586984> Tier 2 Donations List (1.25x)',
                    value: tier2DonationsList
                });
            }

            // Send summary embed if there's anything to report
            if (summary.demotions.length > 0 || summary.promotions.length > 0 || tier2DonationsList) {
                await channel.send({ embeds: [summaryEmbed] });
            }

            // Final message
            await channel.send('▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬');
            await channel.send('✅ Weekly reset simulation completed! This was a test only - no actual data or roles were changed.');

        } catch (error) {
            console.error('Error during reset simulation:', error);
            if (message.channel) {
                await message.channel.send(`❌ Error during reset simulation: ${error.message}`);
            } else {
                console.error('Could not send error message - channel not available');
            }
        }
    }
};