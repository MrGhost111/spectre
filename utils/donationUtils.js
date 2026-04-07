// JavaScript source code
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const usersFilePath = path.join(__dirname, '../data/users.json');
const statsFilePath = path.join(__dirname, '../data/stats.json');
const ACTIVITY_CHANNEL_ID = '1327928516662005770';
const TIER_1_ROLE_ID = '783032959350734868';
const TIER_2_ROLE_ID = '1038888209440067604';
const TIER_1_REQUIREMENT = 35000000;
const TIER_2_REQUIREMENT = 70000000;

// Format number with commas
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Parse amount from Dank Memer message
function parseDonationAmount(description) {
    const amountMatch = description.match(/donate \*\*⏣ ([0-9,]+)\*\*/);
    if (!amountMatch) return null;

    const amountStr = amountMatch[1].replace(/,/g, '');
    return parseInt(amountStr, 10);
}

// Update user donation data
async function updateDonationData(userId, amount, guild) {
    let usersData = {};
    let statsData = { totalDonations: 0 };

    // Load existing data
    try {
        if (fs.existsSync(usersFilePath)) {
            usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
        }
        if (fs.existsSync(statsFilePath)) {
            statsData = JSON.parse(fs.readFileSync(statsFilePath, 'utf8'));
        }
    } catch (error) {
        console.error('Error reading data files:', error);
        throw error;
    }

    // Get member info to determine their tier
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
        throw new Error('User not found in guild');
    }

    const isTier2 = member.roles.cache.has(TIER_2_ROLE_ID);
    const isTier1 = member.roles.cache.has(TIER_1_ROLE_ID);

    if (!isTier1 && !isTier2) {
        throw new Error('User is not a Money Maker');
    }

    // Initialize user data if not exists
    if (!usersData[userId]) {
        usersData[userId] = {
            weeklyDonated: 0,
            totalDonated: 0,
            missedAmount: 0,
            status: 'good',
            currentTier: isTier2 ? 2 : 1,
            lastDonation: new Date().toISOString()
        };
    }

    // Update user data
    usersData[userId].weeklyDonated += amount;
    usersData[userId].totalDonated += amount;
    usersData[userId].lastDonation = new Date().toISOString();
    usersData[userId].currentTier = isTier2 ? 2 : 1;

    statsData.totalDonations += amount;

    // Save data
    fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
    fs.writeFileSync(statsFilePath, JSON.stringify(statsData, null, 2));

    return {
        usersData,
        statsData,
        member,
        requirement: isTier2 ?
            TIER_2_REQUIREMENT :
            TIER_1_REQUIREMENT + (usersData[userId].missedAmount || 0)
    };
}

// Create donation embed
function createDonationEmbed(donor, amount, updatedData) {
    return new EmbedBuilder()
        .setColor('#4c00b0')
        .setTitle('<:prize:1000016483369369650> Money Maker Donation')
        .setDescription(
            `<@${donor.id}> donated **⏣ ${formatNumber(amount)}** coins!\n\n` +
            `<:purpledot:860074414853586984> Weekly Progress: ⏣ ${formatNumber(updatedData.usersData[donor.id].weeklyDonated)}/${formatNumber(updatedData.requirement)}\n` +
            `<:purpledot:860074414853586984> Total Donated: ⏣ ${formatNumber(updatedData.usersData[donor.id].totalDonated)}\n` +
            `<:purpledot:860074414853586984> Server Total: ⏣ ${formatNumber(updatedData.statsData.totalDonations)}`
        )
        .setFooter({ text: `Donor: ${donor.user.tag}` })
        .setTimestamp();
}

// Update status board
async function updateStatusBoard(client) {
    const { tier1Users, tier2Users } = await getWeeklyStats(client);
    const statsData = JSON.parse(fs.readFileSync(statsFilePath, 'utf8'));

    const statusEmbed = new EmbedBuilder()
        .setTitle('<:lbtest:1064919048242090054>  Weekly Donations Leaderboard')
        .setColor('#4c00b0')
        .setTimestamp()
        .setFooter({ text: `Total Server Donations: ⏣ ${formatNumber(statsData.totalDonations)}` });

    if (tier2Users.length > 0) {
        statusEmbed.addFields({
            name: '<:streak:1064909945373458522>  Tier 2 Members',
            value: tier2Users.map((user, index) =>
                `\`${index + 1}.\` <@${user.id}> ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)}`
            ).join('\n') || 'None'
        });
    }

    if (tier1Users.length > 0) {
        statusEmbed.addFields({
            name: '<:YJ_streak:1259258046924853421>  Tier 1 Members',
            value: tier1Users.map((user, index) =>
                `\`${index + 1}.\` <@${user.id}> ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)}`
            ).join('\n') || 'None'
        });
    }

    const activityChannel = await client.channels.fetch(ACTIVITY_CHANNEL_ID);
    const messages = await activityChannel.messages.fetch({ limit: 20 });
    const statusMessage = messages.find(m =>
        m.author.id === client.user.id &&
        m.embeds[0]?.title?.includes('Weekly Donations Leaderboard')
    );

    if (statusMessage) {
        await statusMessage.edit({ embeds: [statusEmbed] });
    } else {
        await activityChannel.send({ embeds: [statusEmbed] });
    }
}

// Get weekly stats (moved from editmm.js)
async function getWeeklyStats(client) {
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

    return { tier1Users, tier2Users };
}

module.exports = {
    parseDonationAmount,
    updateDonationData,
    createDonationEmbed,
    updateStatusBoard
};