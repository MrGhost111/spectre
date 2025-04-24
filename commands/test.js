const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const fs = require('fs');
const path = require('path');

const TIER_1_REQUIREMENT = 35000000;
const TIER_2_REQUIREMENT = 70000000;

const usersFilePath = path.join(__dirname, '../data/users.json');
const statsFilePath = path.join(__dirname, '../data/stats.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test-weekly-reset')
        .setDescription('Simulate weekly reset process without making actual changes'),
    async execute(interaction) {
        // Load real data
        const usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
        const statsData = require(statsFilePath);

        // Prepare summary and simulation data
        const summary = {
            warnings: [],
            demotions: [],
            promotions: []
        };

        let topDonor = null;
        let topDonation = 0;
        let weeklyDonations = 0;

        // Simulate weekly reset calculations
        for (const [userId, userData] of Object.entries(usersData)) {
            weeklyDonations += userData.weeklyDonated || 0;
            if (userData.weeklyDonated > topDonation) {
                topDonor = userId;
                topDonation = userData.weeklyDonated;
            }

            // Simulate requirement check
            const requirement = userData.currentTier === 2 ? TIER_2_REQUIREMENT : TIER_1_REQUIREMENT;
            const missedBy = requirement + (userData.missedAmount || 0) - userData.weeklyDonated;

            if (userData.weeklyDonated >= (requirement + (userData.missedAmount || 0))) {
                // Good standing
                if (userData.weeklyDonated >= (TIER_2_REQUIREMENT + (userData.missedAmount || 0)) && 
                    userData.currentTier === 1) {
                    summary.promotions.push({
                        userId,
                        donated: userData.weeklyDonated,
                        newTier: 2
                    });
                }
            } else {
                // First warning
                if (userData.status === 'good') {
                    summary.warnings.push({
                        userId,
                        missedBy,
                        tier: userData.currentTier,
                        newRequirement: requirement + missedBy
                    });
                } 
                // Second warning (demotion)
                else if (userData.status === 'warned') {
                    summary.demotions.push({
                        userId,
                        fromTier: userData.currentTier,
                        toTier: userData.currentTier - 1,
                        missedBy
                    });
                }
            }
        }

        // Create embeds to simulate announcements
        const announcementEmbed = new EmbedBuilder()
            .setTitle('<:lbtest:1064919048242090054>  Weekly Scoreboard Reset')
            .setColor('#4c00b0')
            .setDescription(`The scoreboard has now been reset! Thank you for all of your donations. 
We have collected ⏣ ${formatNumber(weeklyDonations)} coins this week${statsData.totalDonations ? ` making the total ⏣ ${formatNumber(statsData.totalDonations)}` : ''}.

Keep up the great work. Congratulations to any promoted members and good luck for the next week.`);

        // Top donor embed
        const topDonorEmbed = topDonor ? new EmbedBuilder()
            .setTitle('<:winners:1000018706874781806>  Pro Money Maker of the Week')
            .setColor('#4c00b0')
            .setDescription(`Congratulations to <@${topDonor}> for being the top donor this week with ⏣ ${formatNumber(topDonation)}!`) : null;

        // Summary embed
        const summaryEmbed = new EmbedBuilder()
            .setTitle('<:lbtest:1064919048242090054> Weekly Reset Simulation')
            .setColor('#4c00b0')
            .setTimestamp();

        // Add warnings to summary
        if (summary.warnings.length > 0) {
            summaryEmbed.addFields({
                name: '<:xmark:934659388386451516> Warnings',
                value: summary.warnings.map(w => 
                    `> <@${w.userId}> (Tier ${w.tier})\n>  Missed by ⏣ ${formatNumber(w.missedBy)}\n> New requirement: ⏣ ${formatNumber(w.newRequirement)}`
                ).join('\n\n')
            });
        }

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

        // Reply with embeds
        await interaction.reply({ 
            content: 'Weekly Reset Simulation',
            embeds: [announcementEmbed, ...(topDonorEmbed ? [topDonorEmbed] : []), summaryEmbed]
        });
    }
};

// Utility function to format numbers
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
