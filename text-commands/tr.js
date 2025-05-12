const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Constants - these would normally be imported from config, adding them here for testing
const TIER_1_ROLE_ID = '995621073877176411'; // Replace with actual role ID
const TIER_2_ROLE_ID = '995621112175558757'; // Replace with actual role ID
const PRO_MAKER_ROLE_ID = '1098947918127177800'; // Replace with actual role ID
const TRANSACTION_CHANNEL_ID = '995624090650828812'; // Replace with actual channel ID
const TIER_1_REQUIREMENT = 50000; // Replace with actual requirement
const TIER_2_REQUIREMENT = 150000; // Replace with actual requirement

// Path to data files
const usersFilePath = path.join(__dirname, '..', 'data', 'users.json');
const statsFilePath = path.join(__dirname, '..', 'data', 'stats.json');

// Helper function for number formatting from the original code
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Import the getWeeklyStats function from the appropriate file
// For testing, we'll create a simplified version
async function getWeeklyStats(client) {
    try {
        // Load the user data
        const usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));

        const tier1Users = [];
        const tier2Users = [];

        // Get the guild to check member roles
        const guild = client.guilds.cache.first();
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
        // Check if message.member exists before checking permissions
        if (!message.member) {
            console.log('message.member is undefined. This may be a DM or the bot lacks guild member cache.');
            return message.channel.send('This command can only be used in a server by an administrator.');
        }

        // Check for admin permissions - Use the proper format for Discord.js v14+
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.channel.send('You need administrator permissions to use this command.');
        }

        message.channel.send('🧪 **TEST MODE** - Starting weekly reset simulation. This will NOT affect any real data or roles.');
        await message.channel.send('Loading data and calculating results...');

        try {
            // Load the current data
            let usersData = {};
            let statsData = {};

            try {
                if (fs.existsSync(usersFilePath)) {
                    usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
                    await message.channel.send('✅ Successfully loaded user data');
                } else {
                    await message.channel.send('⚠️ users.json file not found! Using empty data for simulation.');
                }

                if (fs.existsSync(statsFilePath)) {
                    statsData = JSON.parse(fs.readFileSync(statsFilePath, 'utf8'));
                    await message.channel.send('✅ Successfully loaded stats data');
                } else {
                    await message.channel.send('⚠️ stats.json file not found! Using empty data for simulation.');
                }
            } catch (dataLoadError) {
                await message.channel.send(`❌ Error loading data files: ${dataLoadError.message}`);
                return;
            }

            const guild = message.guild;

            // Make sure guild exists
            if (!guild) {
                return message.channel.send('Unable to access guild information. This command must be run in a server.');
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
            await message.channel.send('📊 Analyzing member data and calculating promotions/demotions...');

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
                    await message.channel.send(`⚠️ Error processing member ${userId}: ${memberError.message}`);
                }
            }

            // Get weekly stats
            const { tier1Users, tier2Users } = await getWeeklyStats(client);

            // Simulate all the messages that would be sent
            await message.channel.send('🔄 Generating result messages that would be sent in a real reset...');

            // Separator for clarity
            await message.channel.send('▬▬▬▬▬▬▬▬▬▬ 📢 ANNOUNCEMENT CHANNEL MESSAGES ▬▬▬▬▬▬▬▬▬▬');

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

            await message.channel.send(pingMessage);
            await message.channel.send({ embeds: [weeklyStatsEmbed] });

            // Top donor message
            if (topDonor) {
                const topDonorEmbed = new EmbedBuilder()
                    .setTitle('<:winners:1000018706874781806>  Pro Money Maker of the Week')
                    .setColor('#4c00b0')
                    .setDescription(`> Congratulations to <@${topDonor}> for being the top donor this week with ⏣ ${formatNumber(topDonation)}! They will keep the <@&${PRO_MAKER_ROLE_ID}> role for the next week.`)
                    .setTimestamp();

                await message.channel.send({ embeds: [topDonorEmbed] });
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
                await message.channel.send({ embeds: [promotionEmbed] });
            }

            // Separator for clarity
            await message.channel.send('▬▬▬▬▬▬▬▬▬▬ 👑 ADMIN CHANNEL MESSAGES ▬▬▬▬▬▬▬▬▬▬');

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
                await message.channel.send({ embeds: [summaryEmbed] });
            }

            // Final message
            await message.channel.send('▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬');
            await message.channel.send('✅ Weekly reset simulation completed! This was a test only - no actual data or roles were changed.');

        } catch (error) {
            console.error('Error during reset simulation:', error);
            await message.channel.send(`❌ Error during reset simulation: ${error.message}`);
        }
    }
};