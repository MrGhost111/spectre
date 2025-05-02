const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Constants
const TRANSACTION_CHANNEL_ID = '833246120389902356';
const DANK_MEMER_BOT_ID = '270904126974590976';
const TIER_1_REQUIREMENT = 35000000;
const TIER_2_REQUIREMENT = 70000000;

// File paths
const usersFilePath = path.join(__dirname, '../data/users.json');
const statsFilePath = path.join(__dirname, '../data/stats.json');

let usersData = require(usersFilePath);
let statsData = fs.existsSync(statsFilePath) ? require(statsFilePath) : { totalDonations: 590000000 };

// Utility functions
const saveUsersData = () => fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
const saveStatsData = () => fs.writeFileSync(statsFilePath, JSON.stringify(statsData, null, 2));
const formatNumber = (num) => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// Find donor ID
async function findCommandUser(message) {
    return message.interaction?.user?.id || null;
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

            const hasDonationConfirmation = freshMsg.components?.some(comp => 
                comp.type === 10 && comp.components.some(subComp => 
                    subComp.content?.includes("Successfully donated")
                )
            );

            if (hasDonationConfirmation) {
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

// **Handles donation confirmation, updates stats, sends embed**
async function confirmDonation(client, message, donorId, donationAmount) {
    const guild = await client.guilds.fetch(client.guilds.cache.first().id);
    const member = await guild.members.fetch(donorId);

    usersData[donorId] = usersData[donorId] || {
        totalDonated: 0,
        weeklyDonated: 0,
        missedAmount: 0,
        lastDonation: new Date().toISOString(),
        currentTier: member.roles.cache.has(TIER_2_ROLE_ID) ? 2 :
                     member.roles.cache.has(TIER_1_ROLE_ID) ? 1 : 0
    };

    usersData[donorId].totalDonated += donationAmount;
    usersData[donorId].weeklyDonated += donationAmount;
    usersData[donorId].lastDonation = new Date().toISOString();

    statsData.totalDonations += donationAmount;
    saveStatsData();
    saveUsersData();

    const requirement = usersData[donorId].currentTier === 2 ? TIER_2_REQUIREMENT : TIER_1_REQUIREMENT;
    const donationEmbed = new EmbedBuilder()
        .setTitle('<:prize:1000016483369369650>  New Donation')
        .setColor('#4c00b0')
        .setDescription(`<@${donorId}> donated ⏣ ${formatNumber(donationAmount)}\n\n<:purpledot:860074414853586984>  Weekly Progress: ⏣ ${formatNumber(usersData[donorId].weeklyDonated)}/${formatNumber(requirement + usersData[donorId].missedAmount)}`)
        .setTimestamp();

    await message.channel.send({ embeds: [donationEmbed] });

    setImmediate(() => updateStatusBoard(client).catch(console.error));
}

// **Tracks donation upon message creation**
module.exports = {
    name: 'donationTracker',
    async execute(client, message) {
        if (message.author.id !== DANK_MEMER_BOT_ID || message.channel.id !== TRANSACTION_CHANNEL_ID) return;

        if (message.embeds?.[0]?.description?.includes('Are you sure you want to donate your coins?')) {
            const amountMatch = message.embeds[0].description.match(/donate \*\*⏣ ([0-9,]+)\*\*/);
            if (!amountMatch) return;

            const donorId = await findCommandUser(message);
            if (!donorId) return;

            const initialEmbed = new EmbedBuilder()
                .setTitle('🔍 Donation Tracking Started')
                .setColor('#ff4500')
                .setDescription(`Tracking donation from **<@${donorId}>**.\nAmount: **⏣ ${amountMatch[1]}**`)
                .setTimestamp();

            await message.channel.send({ embeds: [initialEmbed] });

            trackDonation(client, message, donorId, parseInt(amountMatch[1].replace(/,/g, ''), 10));
        }
    }
};
