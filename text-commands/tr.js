const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const TRANSACTION_CHANNEL_ID = '833246120389902356';
const DANK_MEMER_BOT_ID = '270904126974590976';
const ACTIVITY_CHANNEL_ID = '1327928516662005770';
const TIER_1_REQUIREMENT = 35000000;
const TIER_2_REQUIREMENT = 70000000;
const TIER_1_ROLE_ID = '783032959350734868';
const TIER_2_ROLE_ID = '1038888209440067604';
const PRO_MAKER_ROLE_ID = '838478632451178506';
// Paths for data files
const usersFilePath = path.join(__dirname, '../data/users.json');
const statsFilePath = path.join(__dirname, '../data/stats.json');

// Helper function to format numbers
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Helper function to get weekly stats
async function getWeeklyStats(client) {
    try {
        // Load data from files
        let usersData = {};
        if (fs.existsSync(usersFilePath)) {
            usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
        }

        const guild = client.guilds.cache.first();
        const members = await guild.members.fetch();

        const tier1Users = [];
        const tier2Users = [];

        for (const [memberId, member] of members) {
            const hasTier1 = member.roles.cache.has(TIER_1_ROLE_ID);
            const hasTier2 = member.roles.cache.has(TIER_2_ROLE_ID);
            const userData = usersData[memberId] || { weeklyDonated: 0, totalDonated: 0 };

            if (hasTier2) {
                tier2Users.push({
                    id: memberId,
                    weeklyDonated: userData.weeklyDonated || 0,
                    requirement: TIER_2_REQUIREMENT
                });
            } else if (hasTier1) {
                tier1Users.push({
                    id: memberId,
                    weeklyDonated: userData.weeklyDonated || 0,
                    requirement: TIER_1_REQUIREMENT
                });
            }
        }

        // Sort by weekly donated amount (descending)
        tier1Users.sort((a, b) => b.weeklyDonated - a.weeklyDonated);
        tier2Users.sort((a, b) => b.weeklyDonated - a.weeklyDonated);

        return { tier1Users, tier2Users };
    } catch (error) {
        console.error('[TEST RESET] Error getting weekly stats:', error);
        return { tier1Users: [], tier2Users: [] };
    }
}

module.exports = {
    name: 'testreset',
    description: 'Simulates the weekly reset process without making any actual changes',
    permissions: ['ADMINISTRATOR'],
    async execute(message, args) {
        try {
            await message.channel.send('🔄 Starting test weekly reset simulation...');
            console.log('[TEST RESET] Starting test reset simulation');
            
            // Load data from files
            let usersData = {};
            let statsData = { totalDonations: 0 };
            
            if (fs.existsSync(usersFilePath)) {
                usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
                console.log('[TEST RESET] Successfully loaded user data');
            } else {
                console.warn('[TEST RESET] users.json file not found!');
            }
            
            if (fs.existsSync(statsFilePath)) {
                statsData = JSON.parse(fs.readFileSync(statsFilePath, 'utf8'));
                console.log('[TEST RESET] Successfully loaded stats data');
            } else {
                console.warn('[TEST RESET] stats.json file not found!');
            }
            
            const client = message.client;
            const guild = message.guild;
            const channel = message.channel;
            
            // Create summary object to track changes
            const summary = {
                demotions: [],
                promotions: []
            };
            
            // Find top donor
            let topDonor = null;
            let topDonation = 0;
            let weeklyDonations = 0;
            const tier2Donations = [];
            
            const members = await guild.members.fetch();
            for (const [memberId, member] of members) {
                const hasTier1 = member.roles.cache.has(TIER_1_ROLE_ID);
                const hasTier2 = member.roles.cache.has(TIER_2_ROLE_ID);
                
                if (hasTier2 && usersData[memberId]?.weeklyDonated > 0) {
                    tier2Donations.push({
                        id: memberId,
                        donated: usersData[memberId].weeklyDonated
                    });
                }
            }
            
            // Calculate weekly donations and find top donor
            for (const [userId, userData] of Object.entries(usersData)) {
                weeklyDonations += userData.weeklyDonated || 0;
                if (userData.weeklyDonated > topDonation) {
                    topDonor = userId;
                    topDonation = userData.weeklyDonated;
                }
            }
            
            // Get weekly stats
            const { tier1Users, tier2Users } = await getWeeklyStats(client);
            
            // 1. Send initial announcement message
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
            
            await channel.send(`**[TEST RESET - Announcement Channel Message]**\n${pingMessage}`);
            await channel.send({ content: "**[TEST RESET - Announcement Channel Embed]**", embeds: [weeklyStatsEmbed] });
            
            // 2. Top donor processing
            const promotionUserIds = [];
            
            if (topDonor) {
                const topDonorMember = await guild.members.fetch(topDonor).catch(() => null);
                
                if (topDonorMember) {
                    const topDonorEmbed = new EmbedBuilder()
                        .setTitle('<:winners:1000018706874781806>  Pro Money Maker of the Week')
                        .setColor('#4c00b0')
                        .setDescription(`> Congratulations to <@${topDonor}> for being the top donor this week with ⏣ ${formatNumber(topDonation)}! They will keep the <@&${PRO_MAKER_ROLE_ID}> role for the next week.`)
                        .setTimestamp();
                    
                    await channel.send({ content: "**[TEST RESET - Top Donor Announcement]**", embeds: [topDonorEmbed] });
                }
            }
            
            // 3. Process promotions and demotions
            for (const [userId, userData] of Object.entries(usersData)) {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (!member) continue;
                
                const isTier2 = member.roles.cache.has(TIER_2_ROLE_ID);
                const isTier1 = member.roles.cache.has(TIER_1_ROLE_ID);
                
                // Promotion logic - Tier 1 to Tier 2 (simulation only)
                if (isTier1 && !isTier2 && userData.weeklyDonated >= TIER_2_REQUIREMENT) {
                    promotionUserIds.push(userId);
                    summary.promotions.push({
                        userId,
                        donated: userData.weeklyDonated,
                        newTier: 2
                    });
                }
                
                // Demotion logic - Tier 2 to Tier 1 (simulation only)
                if (isTier2) {
                    if (userData.weeklyDonated < TIER_2_REQUIREMENT) {
                        summary.demotions.push({
                            userId,
                            fromTier: 2,
                            toTier: 1,
                            missedBy: TIER_2_REQUIREMENT - userData.weeklyDonated
                        });
                        
                        const demotionEmbed = new EmbedBuilder()
                            .setTitle('<:xmark:934659388386451516> Weekly Requirement Not Met')
                            .setColor('#ff0000')
                            .setDescription(`You missed this week's Tier 2 requirement by ⏣ ${formatNumber(TIER_2_REQUIREMENT - userData.weeklyDonated)}.\n\nYou have been demoted to Tier 1. Your new requirement for next week will be ⏣ ${formatNumber(TIER_1_REQUIREMENT)}.`)
                            .setTimestamp();
                        
                        await channel.send({ content: `**[TEST RESET - DM to <@${userId}>]**`, embeds: [demotionEmbed] });
                    }
                }
                // Demotion logic - Tier 1 to No Role (simulation only)
                else if (isTier1) {
                    if (userData.weeklyDonated < TIER_1_REQUIREMENT) {
                        summary.demotions.push({
                            userId,
                            fromTier: 1,
                            toTier: 0,
                            missedBy: TIER_1_REQUIREMENT - userData.weeklyDonated
                        });
                        
                        const demotionEmbed = new EmbedBuilder()
                            .setTitle('<:xmark:934659388386451516> Weekly Requirement Not Met')
                            .setColor('#ff0000')
                            .setDescription(`You missed this week's Tier 1 requirement by ⏣ ${formatNumber(TIER_1_REQUIREMENT - userData.weeklyDonated)}.\n\nYou have been removed from the Money Makers team. If you wish to rejoin then please wait for a week and then dm faiz`)
                            .setTimestamp();
                        
                        await channel.send({ content: `**[TEST RESET - DM to <@${userId}>]**`, embeds: [demotionEmbed] });
                    }
                }
            }
            
            // 4. Send promotion announcements
            if (promotionUserIds.length > 0) {
                const promotionEmbed = new EmbedBuilder()
                    .setTitle('<:power:1064835342160625784>  Promotions')
                    .setColor('#4c00b0')
                    .setDescription(
                        "These users have fulfilled the requirement to move up a level. They are promoted to tier 2\n\n" +
                        promotionUserIds.map(id => `<:aquadot:860074237954883585> <@${id}>`).join('\n')
                    )
                    .setTimestamp();
                    
                await channel.send({ content: "**[TEST RESET - Promotion Announcement]**", embeds: [promotionEmbed] });
            }
            
            // 5. Generate and send admin summary
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
                value: `Total Weekly Donations: ⏣ ${formatNumber(weeklyDonations)}\nTotal Server Donations: ⏣ ${formatNumber(statsData.totalDonations)}`
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
            
            if (summary.demotions.length > 0 || summary.promotions.length > 0 || tier2DonationsList) {
                await channel.send({ content: "**[TEST RESET - Admin Channel Summary]**", embeds: [summaryEmbed] });
            }
            
            // 6. Send final confirmation message
            await channel.send('✅ Test weekly reset simulation completed successfully! All potential actions have been displayed in this channel.');
            
            console.log('[TEST RESET] Test reset simulation completed');
        } catch (error) {
            console.error('[TEST RESET] Error in test reset simulation:', error);
            await message.channel.send(`❌ An error occurred during the test reset simulation: ${error.message}`);
        }
    },
};
