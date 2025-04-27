const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Constants - make sure these match your existing setup
const ACTIVITY_CHANNEL_ID = '1327928516662005770';
const TIER_1_ROLE_ID = '783032959350734868';
const TIER_2_ROLE_ID = '1038888209440067604';
const TIER_1_REQUIREMENT = 35000000;
const TIER_2_REQUIREMENT = 70000000;

// File paths
const usersFilePath = path.join(__dirname, '../data/users.json');
const statsFilePath = path.join(__dirname, '../data/stats.json');

// Format number with commas
const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

async function getWeeklyStats(client) {
    // Load latest data
    let usersData = {};
    let statsData = { totalDonations: 0 };

    try {
        if (fs.existsSync(usersFilePath)) {
            usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
        }
        if (fs.existsSync(statsFilePath)) {
            statsData = JSON.parse(fs.readFileSync(statsFilePath, 'utf8'));
        }
    } catch (error) {
        console.error('Error reading data files:', error);
        return { tier1Users: [], tier2Users: [] };
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

            const userData = usersData[memberId];
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
    }

    tier2Users.sort((a, b) => b.weeklyDonated - a.weeklyDonated);
    tier1Users.sort((a, b) => b.weeklyDonated - a.weeklyDonated);

    return { tier1Users, tier2Users, totalDonations: statsData.totalDonations || 0 };
}

module.exports = {
    name: 'board',
    description: 'Sends or updates the donations status board',
    async execute(message) {
        try {
            const activityChannel = await message.client.channels.fetch(ACTIVITY_CHANNEL_ID);
            const { tier1Users, tier2Users, totalDonations } = await getWeeklyStats(message.client);

            const embed = new EmbedBuilder()
                .setTitle('<:lbtest:1064919048242090054>  Weekly Donations Leaderboard')
                .setColor('#4c00b0')
                .setTimestamp()
                .setFooter({ text: `Total Server Donations: ⏣ ${formatNumber(totalDonations)}` });

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

            // Send the embed to the activity channel
            await activityChannel.send({ embeds: [embed] });

            // Confirm to the user who triggered the command
            await message.reply('Status board has been posted in the activity channel!');

        } catch (error) {
            console.error('Error executing board command:', error);
            await message.reply('There was an error creating the status board. Please check the logs.');
        }
    },
};