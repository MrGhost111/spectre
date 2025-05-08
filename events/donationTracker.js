const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Constants
const TRANSACTION_CHANNEL_ID = '833246120389902356';
const DANK_MEMER_BOT_ID = '270904126974590976';
const ACTIVITY_CHANNEL_ID = '1327928516662005770';
const TIER_1_REQUIREMENT = 35000000;
const TIER_2_REQUIREMENT = 70000000;
const TIER_1_ROLE_ID = '783032959350734868';
const TIER_2_ROLE_ID = '1038888209440067604';

// File paths
const usersFilePath = path.join(__dirname, '../data/users.json');
const statsFilePath = path.join(__dirname, '../data/stats.json');

// Utility functions
const formatNumber = (num) => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// Find donor ID
async function findCommandUser(message) {
    return message.interaction?.user?.id || null;
}

// Get weekly statistics for status board
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

// Parse components to extract donation amount
function extractDonationAmount(components) {
    if (!components || !Array.isArray(components)) return null;

    // Recursively search through components structure
    for (const comp of components) {
        // Check if this component contains content with donation info
        if (comp.content && typeof comp.content === 'string') {
            const amountMatch = comp.content.match(/donate \*\*⏣ ([0-9,]+)\*\*/);
            if (amountMatch) {
                return parseInt(amountMatch[1].replace(/,/g, ''), 10);
            }
        }

        // Check nested components
        if (comp.components && Array.isArray(comp.components)) {
            const result = extractDonationAmount(comp.components);
            if (result) return result;
        }
    }

    return null;
}

// Check if components contain confirmation message
function hasDonationConfirmation(components) {
    if (!components || !Array.isArray(components)) return false;

    // Convert to string and check for success message
    const componentsStr = JSON.stringify(components);
    return componentsStr.includes('Successfully donated');
}

// Check if components contain pending confirmation message
function hasPendingConfirmation(components) {
    if (!components || !Array.isArray(components)) return false;

    // Recursively search through components structure
    for (const comp of components) {
        // Check if this component contains the pending confirmation header
        if (comp.content && typeof comp.content === 'string' &&
            comp.content.includes('Pending Confirmation')) {
            return true;
        }

        // Check nested components
        if (comp.components && Array.isArray(comp.components)) {
            if (hasPendingConfirmation(comp.components)) return true;
        }
    }

    return false;
}

// **Tracks donation message edits every 5 seconds for 30 seconds**
async function trackDonation(client, message, donorId, donationAmount) {
    let attempts = 0;
    const checkInterval = setInterval(async () => {
        if (attempts >= 6) {
            console.log("⏹️ Stopping donation tracking: No confirmation detected within 30 seconds.");
            clearInterval(checkInterval);
            return;
        }

        try {
            console.log(`🔎 Checking donation status... Attempt ${attempts + 1}`);

            const freshMsg = await message.channel.messages.fetch(message.id);
            console.log("📥 Fetched updated message components:", JSON.stringify(freshMsg.components, null, 2));

            // Check if the message has confirmation in components
            if (hasDonationConfirmation(freshMsg.components)) {
                console.log("✅ Donation confirmation detected!");
                clearInterval(checkInterval);
                await confirmDonation(client, freshMsg, donorId, donationAmount);
                return;
            }
        } catch (error) {
            console.error("⚠️ Error fetching updated message:", error);
        }

        attempts++;
    }, 5000);
}

// **Handles donation confirmation, updates stats, sends embed, updates status board**
async function confirmDonation(client, message, donorId, donationAmount) {
    // Load the latest data to ensure we have current values
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
    }

    const guild = await client.guilds.fetch(client.guilds.cache.first().id);
    const member = await guild.members.fetch(donorId);

    // Ensure user exists in users.json
    if (!usersData[donorId]) {
        usersData[donorId] = {
            totalDonated: 0,
            weeklyDonated: 0,
            missedAmount: 0,
            status: 'good',
            lastDonation: new Date().toISOString(),
            currentTier: member.roles.cache.has(TIER_2_ROLE_ID) ? 2 :
                member.roles.cache.has(TIER_1_ROLE_ID) ? 1 : 0
        };
    }

    // Update user donation values
    usersData[donorId].totalDonated += donationAmount;
    usersData[donorId].weeklyDonated += donationAmount;
    usersData[donorId].lastDonation = new Date().toISOString();
    statsData.totalDonations += donationAmount;

    // Save updated data
    fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
    fs.writeFileSync(statsFilePath, JSON.stringify(statsData, null, 2));

    // Determine their weekly progress after donation
    const requirement = usersData[donorId].currentTier === 2 ? TIER_2_REQUIREMENT : TIER_1_REQUIREMENT;
    const weeklyProgress = `${formatNumber(usersData[donorId].weeklyDonated)}/${formatNumber(requirement + usersData[donorId].missedAmount)}`;

    // Send confirmation embed
    const donationEmbed = new EmbedBuilder()
        .setTitle('<:prize:1000016483369369650>  New Donation')
        .setColor('#4c00b0')
        .setDescription(`<@${donorId}> donated ⏣ ${formatNumber(donationAmount)}\n\n<:purpledot:860074414853586984>  Weekly Progress: ⏣ ${weeklyProgress}`)
        .setTimestamp();

    await message.channel.send({ embeds: [donationEmbed] });

    // **NEW IMPROVED STATUS BOARD HANDLING**
    try {
        const activityChannel = await client.channels.fetch(ACTIVITY_CHANNEL_ID);
        const { tier1Users, tier2Users } = await getWeeklyStats(client);

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
    } catch (error) {
        console.error('Error updating status board:', error);
    }
}

// **Tracks donation upon message creation**
module.exports = {
    name: 'donationTracker',
    async execute(client, message) {
        if (message.author.id !== DANK_MEMER_BOT_ID || message.channel.id !== TRANSACTION_CHANNEL_ID) return;

        // Check for pending confirmation in components
        if (hasPendingConfirmation(message.components)) {
            // Extract donation amount from components
            const donationAmount = extractDonationAmount(message.components);
            if (!donationAmount) {
                console.log("⚠️ Could not extract donation amount from message components");
                return;
            }

            const donorId = await findCommandUser(message);
            if (!donorId) {
                console.log("⚠️ Could not identify donor from message");
                return;
            }

            console.log(`📝 Detected donation attempt: ${donorId} is donating ⏣ ${donationAmount}`);
            trackDonation(client, message, donorId, donationAmount);
        }
    }
};