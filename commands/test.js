const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Constants directly included from donationTracker.js
const TRANSACTION_CHANNEL_ID = '833246120389902356';
const TIER_1_REQUIREMENT = 35000000;
const TIER_2_REQUIREMENT = 70000000;
const TIER_1_ROLE_ID = '783032959350734868';
const TIER_2_ROLE_ID = '1038888209440067604';
const PRO_MAKER_ROLE_ID = '838478632451178506'; 

// File paths
const usersFilePath = path.join(__dirname, '../data/users.json');
const statsFilePath = path.join(__dirname, '../data/stats.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test-weekly-reset')
        .setDescription('Simulate weekly reset process without making actual changes'),
    async execute(interaction) {
        try {
            // Load real data
            const usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
            const statsData = require(statsFilePath);

            // Prepare summary and simulation data
            const summary = {
                demotions: [],
                promotions: []
            };

            let topDonor = null;
            let topDonation = 0;
            let weeklyDonations = 0;
            const tier2Donations = [];

            // Get guild and member information for simulation only
            const guild = interaction.guild;
            const members = await guild.members.fetch();
            const tier1Members = [];
            const tier2Members = [];

            // First pass: collect members and donations
            for (const [memberId, member] of members) {
                const hasTier1 = member.roles.cache.has(TIER_1_ROLE_ID);
                const hasTier2 = member.roles.cache.has(TIER_2_ROLE_ID);

                if (hasTier1) tier1Members.push(memberId);
                if (hasTier2) tier2Members.push(memberId);

                if (usersData[memberId] && (hasTier1 || hasTier2)) {
                    weeklyDonations += usersData[memberId].weeklyDonated || 0;

                    if (usersData[memberId].weeklyDonated > topDonation) {
                        topDonor = memberId;
                        topDonation = usersData[memberId].weeklyDonated;
                    }

                    if (hasTier2 && usersData[memberId].weeklyDonated > 0) {
                        tier2Donations.push({
                            id: memberId,
                            donated: usersData[memberId].weeklyDonated
                        });
                    }
                }
            }

            // Second pass: simulate requirement checks and consequences
            for (const [userId, userData] of Object.entries(usersData)) {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (!member) continue;

                const isTier2 = member.roles.cache.has(TIER_2_ROLE_ID);
                const isTier1 = member.roles.cache.has(TIER_1_ROLE_ID);

                // Promotion logic - Tier 1 to Tier 2
                if (isTier1 && !isTier2 && userData.weeklyDonated >= TIER_2_REQUIREMENT) {
                    summary.promotions.push({
                        userId,
                        donated: userData.weeklyDonated,
                        newTier: 2
                    });
                }

                // Demotion logic - Tier 2 to Tier 1
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
                // Demotion logic - Tier 1 to No Role
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
            }

            // Get weekly stats for the report
            const { tier1Users, tier2Users } = await getWeeklyStats(interaction.client);
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

            // Create embeds to simulate announcements
            const announcementEmbed = new EmbedBuilder()
                .setTitle('<:lbtest:1064919048242090054>  Weekly Scoreboard Reset')
                .setColor('#4c00b0')
                .setDescription(`<@&${TIER_1_ROLE_ID}> 
The scoreboard has now been reset! Thank you for all of your donations. We have collected ⏣ ${formatNumber(weeklyDonations)} coins this week${statsData.totalDonations ? ` making the total ⏣ ${formatNumber(statsData.totalDonations)}` : ''}.

Keep up the great work. Congratulations to any promoted members and good luck for the next week.
You can now send your new requirements in <#${TRANSACTION_CHANNEL_ID}> according to your level!!`);

            // Top donor embed
            const topDonorEmbed = topDonor ? new EmbedBuilder()
                .setTitle('<:winners:1000018706874781806>  Pro Money Maker of the Week')
                .setColor('#4c00b0')
                .setDescription(`> Congratulations to <@${topDonor}> for being the top donor this week with ⏣ ${formatNumber(topDonation)}! They will keep the <@&${PRO_MAKER_ROLE_ID}> role for the next week.`)
                .setTimestamp() : null;

            // Promotions embed
            const promotionIds = summary.promotions.map(p => p.userId);
            const promotionEmbed = promotionIds.length > 0 ? new EmbedBuilder()
                .setTitle('<:power:1064835342160625784>  Promotions')
                .setColor('#4c00b0')
                .setDescription(
                    "These users have fulfilled the requirement to move up a level. They are promoted to tier 2\n\n" +
                    promotionIds.map(id => `<:aquadot:860074237954883585> <@${id}>`).join('\n')
                )
                .setTimestamp() : null;

            // Summary embed for admin
            const tier2DonationsList = tier2Donations
                .filter(donation => donation.donated > 0)
                .map(donation => `/dono add user: <@${donation.id}> amount: ${formatNumber(Math.floor(donation.donated * 1.25))}`)
                .join('\n');

            const summaryEmbed = new EmbedBuilder()
                .setTitle('<:lbtest:1064919048242090054> Weekly Reset Simulation')
                .setColor('#4c00b0')
                .setTimestamp();

            summaryEmbed.addFields({
                name: '📊 Weekly Statistics',
                value: `Total Weekly Donations: ⏣ ${formatNumber(weeklyDonations)}\nTotal Server Donations: ⏣ ${formatNumber(statsData.totalDonations)}`
            });

            // Add the weekly stats to the summary
            summaryEmbed.addFields([...weeklyStatsEmbed.data.fields]);

            // Add demotions to summary
            if (summary.demotions.length > 0) {
                summaryEmbed.addFields({
                    name: '<:xmark:934659388386451516> Demotions',
                    value: summary.demotions.map(d =>
                        `> <@${d.userId}> (Tier ${d.fromTier} → ${d.toTier})\n> Missed by ⏣ ${formatNumber(d.missedBy)}`
                    ).join('\n\n')
                });
            }

            // Add promotions to summary
            if (summary.promotions.length > 0) {
                summaryEmbed.addFields({
                    name: '<:purpledot:860074414853586984>  Promotions',
                    value: summary.promotions.map(p =>
                        `> <@${p.userId}> → Tier ${p.newTier}\n> Donated: ⏣ ${formatNumber(p.donated)}`
                    ).join('\n\n')
                });
            }

            // Add tier 2 donations list if applicable
            if (tier2DonationsList) {
                summaryEmbed.addFields({
                    name: '<:purpledot:860074414853586984> Tier 2 Donations List (1.25x)',
                    value: tier2DonationsList
                });
            }

            // User DM previews for demotions
            const dmPreviewsEmbed = new EmbedBuilder()
                .setTitle('📨 DM Previews')
                .setColor('#ff0000')
                .setDescription('These DMs would be sent to members who failed to meet requirements:');

            let hasDmPreviews = false;

            // Add tier 2 demotion DM previews
            const tier2Demotions = summary.demotions.filter(d => d.fromTier === 2);
            if (tier2Demotions.length > 0) {
                hasDmPreviews = true;
                dmPreviewsEmbed.addFields({
                    name: 'Tier 2 → Tier 1 Demotion Messages',
                    value: tier2Demotions.map(d =>
                        `**To <@${d.userId}>:**\n*You missed this week's Tier 2 requirement by ⏣ ${formatNumber(d.missedBy)}.\n\nYou have been demoted to Tier 1. Your new requirement for next week will be ⏣ ${formatNumber(TIER_1_REQUIREMENT)}.*`
                    ).join('\n\n')
                });
            }

            // Add tier 1 demotion DM previews
            const tier1Demotions = summary.demotions.filter(d => d.fromTier === 1);
            if (tier1Demotions.length > 0) {
                hasDmPreviews = true;
                dmPreviewsEmbed.addFields({
                    name: 'Tier 1 → No Role Demotion Messages',
                    value: tier1Demotions.map(d =>
                        `**To <@${d.userId}>:**\n*You missed this week's Tier 1 requirement by ⏣ ${formatNumber(d.missedBy)}.\n\nYou have been removed from the Money Maker role.*`
                    ).join('\n\n')
                });
            }

            // Reply with all embeds
            const embeds = [
                announcementEmbed,
                weeklyStatsEmbed,
                ...(topDonorEmbed ? [topDonorEmbed] : []),
                ...(promotionEmbed ? [promotionEmbed] : []),
                summaryEmbed,
                ...(hasDmPreviews ? [dmPreviewsEmbed] : [])
            ];

            await interaction.reply({
                content: '**WEEKLY RESET SIMULATION** - No changes have been made to roles or data. This is only a preview.',
                embeds: embeds
            });
        } catch (error) {
            console.error('Error in test-weekly-reset command:', error);
            await interaction.reply({
                content: `An error occurred while simulating weekly reset: ${error.message}`,
                ephemeral: true
            });
        }
    }
};

// Include the getWeeklyStats function directly from the info you provided
async function getWeeklyStats(client) {
    // Load latest data
    let usersData = {};
    try {
        if (fs.existsSync(usersFilePath)) {
            usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
        }
    } catch (error) {
        console.error('Error reading users data file:', error);
    }

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

// Utility function to format numbers
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}