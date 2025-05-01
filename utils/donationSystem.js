const { EmbedBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

// Constants
const TIER_1_ROLE_ID = '783032959350734868';
const TIER_2_ROLE_ID = '1038888209440067604';
const TRANSACTION_CHANNEL_ID = '833246120389902356';
const DANK_MEMER_BOT_ID = '270904126974590976';
const ACTIVITY_CHANNEL_ID = '1327928516662005770';

// Data paths
const usersFilePath = path.join(__dirname, '../data/users.json');
const statsFilePath = path.join(__dirname, '../data/stats.json');
let usersData = {};
let statsData = { totalDonations: 0 };

// Load data if files exist
try {
    usersData = fs.existsSync(usersFilePath) ? require(usersFilePath) : {};
    statsData = fs.existsSync(statsFilePath) ? require(statsFilePath) : { totalDonations: 0 };
} catch (error) {
    console.error('Error loading data files:', error);
}

// Utility functions
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function saveStatsData() {
    fs.writeFileSync(statsFilePath, JSON.stringify(statsData, null, 2));
}

function saveUsersData() {
    fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
}

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
            if (userMatch) return userMatch[1];
        }

        return null;
    } catch (error) {
        console.error('Error in findCommandUser:', error);
        return null;
    }
}

async function updateStatusBoard(client) {
    try {
        const activityChannel = await client.channels.fetch(ACTIVITY_CHANNEL_ID);
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

        const embed = new EmbedBuilder()
            .setTitle('<:lbtest:1064919048242090054> Weekly Donations Leaderboard')
            .setColor('#4c00b0')
            .setTimestamp()
            .setFooter({ text: `Total Server Donations: ⏣ ${formatNumber(statsData.totalDonations)}` });

        if (tier2Users.length > 0) {
            embed.addFields({
                name: '<:streak:1064909945373458522> Tier 2 Members',
                value: tier2Users.map((user, index) =>
                    `\`${index + 1}.\` <@${user.id}> ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)}`
                ).join('\n') || 'None'
            });
        }

        if (tier1Users.length > 0) {
            embed.addFields({
                name: '<:YJ_streak:1259258046924853421> Tier 1 Members',
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

    } catch (error) {
        console.error('Error updating status board:', error);
    }
}

async function processDonation(client, message, donationAmount, donorId) {
    if (!donorId) {
        console.log('Could not find donor ID');
        return false;
    }

    const guild = await client.guilds.fetch(client.guilds.cache.first().id);
    const member = await guild.members.fetch(donorId).catch(() => null);

    if (!usersData[donorId]) {
        usersData[donorId] = {
            totalDonated: donationAmount,
            weeklyDonated: donationAmount,
            currentTier: member?.roles.cache.has(TIER_2_ROLE_ID) ? 2 :
                (member?.roles.cache.has(TIER_1_ROLE_ID) ? 1 : 0),
            status: 'good',
            missedAmount: 0,
            lastDonation: new Date().toISOString()
        };
    } else {
        usersData[donorId].totalDonated += donationAmount;
        usersData[donorId].weeklyDonated += donationAmount;
        usersData[donorId].lastDonation = new Date().toISOString();
        usersData[donorId].currentTier = member?.roles.cache.has(TIER_2_ROLE_ID) ? 2 :
            (member?.roles.cache.has(TIER_1_ROLE_ID) ? 1 : 0);
    }

    statsData.totalDonations += donationAmount;
    saveStatsData();
    saveUsersData();

    const requirement = usersData[donorId].currentTier === 2 ?
        TIER_2_REQUIREMENT : TIER_1_REQUIREMENT;

    const donationEmbed = new EmbedBuilder()
        .setTitle('<:prize:1000016483369369650> New Donation')
        .setColor('#4c00b0')
        .setDescription(`<@${donorId}> donated ⏣ ${formatNumber(donationAmount)}\n\n<:purpledot:860074414853586984> Weekly Progress: ⏣ ${formatNumber(usersData[donorId].weeklyDonated)}/${formatNumber(requirement + (usersData[donorId].missedAmount || 0))}`)
        .setTimestamp();

    await message.channel.send({ embeds: [donationEmbed] });
    await updateStatusBoard(client);
    return true;
}

async function checkComponentsForDonation(message) {
    if (message.components?.length > 0) {
        for (const component of message.components) {
            if (component.type === 17) { // Formatted Text component
                for (const subComponent of component.components) {
                    if (subComponent.type === 10 && // Text component
                        subComponent.content?.includes('Successfully donated')) {

                        const donationMatch = subComponent.content.match(/Successfully donated \*\*⏣\s*([\d,]+)\*\*/);
                        if (!donationMatch) continue;

                        return {
                            amount: parseInt(donationMatch[1].replace(/,/g, ''), 10),
                            donorId: message.interaction?.user?.id
                        };
                    }
                }
            }
        }
    }
    return null;
}

module.exports = {
    processDonation,
    checkComponentsForDonation,
    findCommandUser,
    updateStatusBoard,
    formatNumber,
    saveStatsData,
    saveUsersData,
    usersData,
    statsData
};