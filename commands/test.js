const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('weekly-reset-test')
        .setDescription('Preview the weekly reset announcements')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const usersFilePath = path.join(__dirname, '../data/users.json');
            const statsFilePath = path.join(__dirname, '../data/stats.json');
            
            const usersData = require(usersFilePath);
            const statsData = require(statsFilePath);

            const TIER_1_REQUIREMENT = 35000000;
            const TIER_2_REQUIREMENT = 70000000;
            const TIER_1_ROLE_ID = '783032959350734868';
            const TIER_2_ROLE_ID = '1038888209440067604';
            const TRANSACTION_CHANNEL_ID = '833246120389902356';
            const PRO_MAKER_ROLE_ID = '838478632451178506';

            const formatNumber = (num) => {
                return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            };

            const guild = interaction.guild;
            const members = await guild.members.fetch();

            let weeklyDonations = 0;
            let topDonor = null;
            let topDonation = 0;

            for (const [memberId, userData] of Object.entries(usersData)) {
                weeklyDonations += userData.weeklyDonated || 0;
                if ((userData.weeklyDonated || 0) > topDonation) {
                    topDonor = memberId;
                    topDonation = userData.weeklyDonated || 0;
                }
            }

            const tier1Users = [];
            const tier2Users = [];

            // Check for promotions
            for (const [memberId, member] of members) {
                const hasTier1 = member.roles.cache.has(TIER_1_ROLE_ID);
                const hasTier2 = member.roles.cache.has(TIER_2_ROLE_ID);
                
                const userData = usersData[memberId] || { weeklyDonated: 0 };

                if (hasTier1 && !hasTier2 && userData.weeklyDonated >= (TIER_2_REQUIREMENT + (userData.missedAmount || 0))) {
                    const promotionEmbed = new EmbedBuilder()
                        .setTitle('<:power:1064835342160625784>  Member Promotion')
                        .setColor('#4c00b0')
                        .setDescription(` Congratulations to <@${memberId}> for being promoted to Tier 2!\n Weekly donation: ⏣ ${formatNumber(userData.weeklyDonated)}`)
                        .setTimestamp();

                    await interaction.channel.send({ embeds: [promotionEmbed] });
                }

                if (hasTier2) {
                    tier2Users.push({
                        id: memberId,
                        weeklyDonated: userData.weeklyDonated || 0,
                        requirement: userData.missedAmount ? TIER_2_REQUIREMENT + userData.missedAmount : TIER_2_REQUIREMENT
                    });
                } else if (hasTier1) {
                    tier1Users.push({
                        id: memberId,
                        weeklyDonated: userData.weeklyDonated || 0,
                        requirement: userData.missedAmount ? TIER_1_REQUIREMENT + userData.missedAmount : TIER_1_REQUIREMENT
                    });
                }
            }

            tier2Users.sort((a, b) => b.weeklyDonated - a.weeklyDonated);
            tier1Users.sort((a, b) => b.weeklyDonated - a.weeklyDonated);

            await interaction.channel.send(`<@&${TIER_1_ROLE_ID}> 
The scoreboard has now been reset! Thank you for all of your donations. We have collected ⏣ ${formatNumber(weeklyDonations)} coins this week making the total ⏣ ${formatNumber(statsData.totalDonations || 0)}. Keep up the great work. 
Congratulations to any promoted members and good luck for the next week. 
You can now send your new requirements in <#${TRANSACTION_CHANNEL_ID}> according to your level!!`);

            const statusEmbed = new EmbedBuilder()
                .setTitle('<:lbtest:1064919048242090054>  Weekly Donations Performance')
                .setColor('#4c00b0')
                .setDescription('Here is how our Money Makers performed this week:');

            if (tier2Users.length > 0) {
                statusEmbed.addFields({
                    name: '<:streak:1064909945373458522>  Tier 2 Top Performers',
                    value: tier2Users.map((user, index) => 
                        `\`${index + 1}.\` <@${user.id}> ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)}`
                    ).join('\n') || 'None'
                });
            }

            if (tier1Users.length > 0) {
                statusEmbed.addFields({
                    name: '<:YJ_streak:1259258046924853421>  Tier 1 Top Performers',
                    value: tier1Users.map((user, index) => 
                        `\`${index + 1}.\` <:aquadot:860074237954883585> <@${user.id}> ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)}`
                    ).join('\n') || 'None'
                });
            }

            await interaction.channel.send({ embeds: [statusEmbed] });

            if (topDonor) {
                const topDonorEmbed = new EmbedBuilder()
                    .setTitle('<:winners:1000018706874781806>  Top Donor of the Week')
                    .setColor('#4c00b0')
                    .setDescription(`> Congratulations to <@${topDonor}> for being the top donor this week with ⏣ ${formatNumber(topDonation)}! They will keep the <@&${PRO_MAKER_ROLE_ID}> role for the next week.`)
                    .setTimestamp();

                await interaction.channel.send({ embeds: [topDonorEmbed] });
            }

            await interaction.editReply('Weekly reset announcements sent successfully!');

        } catch (error) {
            console.error('Error in weekly reset test:', error);
            await interaction.editReply('Failed to send weekly reset announcements.');
        }
    }
};
