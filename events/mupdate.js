// events/mupdate.js
// Responsibilities:
//   1. Track edited messages for snipe (unrelated to donations)
//   2. Detect Dank Memer donation confirmations in the transaction channel
//   3. Save donation to disk and send a confirmation embed
//   4. Update the leaderboard in the activity channel

const { EmbedBuilder, Events } = require('discord.js');
const {
    loadUsers,
    loadStats,
    saveUsers,
    saveStats,
    formatNumber,
    findCommandUser,
    updateStatusBoard,
    TIER_1_ROLE_ID,
    TIER_2_ROLE_ID,
    TIER_1_REQUIREMENT,
    TIER_2_REQUIREMENT,
} = require('../donationSystem');

const TRANSACTION_CHANNEL_ID = '833246120389902356';
const DANK_MEMER_BOT_ID = '270904126974590976';

module.exports = {
    name: Events.MessageUpdate,

    async execute(client, oldMessage, newMessage) {
        try {
            // ── Snipe tracking ────────────────────────────────────────────────
            if (
                oldMessage.content &&
                newMessage.content &&
                oldMessage.content !== newMessage.content
            ) {
                if (!client.editedMessages) client.editedMessages = new Map();
                const channelEdits = client.editedMessages.get(newMessage.channel.id) || [];
                if (channelEdits.length >= 50) channelEdits.shift();
                channelEdits.push({
                    author: newMessage.author?.tag,
                    oldContent: oldMessage.content,
                    newContent: newMessage.content,
                    timestamp: Math.floor(Date.now() / 1000),
                    messageId: newMessage.id,
                });
                client.editedMessages.set(newMessage.channel.id, channelEdits);
            }

            // ── Donation detection — Dank Memer in transaction channel only ──
            if (
                newMessage.channel?.id !== TRANSACTION_CHANNEL_ID ||
                newMessage.author?.id !== DANK_MEMER_BOT_ID
            ) return;

            if (!newMessage.embeds?.length) return;

            const embed = newMessage.embeds[0];
            if (!embed.description?.includes('Successfully donated')) return;

            const donationMatch = embed.description.match(
                /Successfully donated \*\*⏣\s*([\d,]+)\*\*/
            );
            if (!donationMatch) return;

            const donationAmount = parseInt(donationMatch[1].replace(/,/g, ''), 10);
            const donorId = await findCommandUser(newMessage);

            if (!donorId) {
                console.warn('[DONATION] Could not resolve donor ID');
                return;
            }

            const guild = client.guilds.cache.first();
            const member = await guild.members.fetch(donorId).catch(() => null);

            if (!member) {
                console.warn(`[DONATION] Member ${donorId} not found in guild`);
                return;
            }

            const currentTier = member.roles.cache.has(TIER_2_ROLE_ID) ? 2
                : member.roles.cache.has(TIER_1_ROLE_ID) ? 1
                    : 0;

            // Load fresh → update → save
            const usersData = loadUsers();
            const statsData = loadStats();

            if (!usersData[donorId]) {
                usersData[donorId] = {
                    totalDonated: 0,
                    weeklyDonated: 0,
                    currentTier,
                    status: 'good',
                    missedAmount: 0,
                    lastDonation: new Date().toISOString(),
                };
            }

            usersData[donorId].totalDonated = (usersData[donorId].totalDonated || 0) + donationAmount;
            usersData[donorId].weeklyDonated = (usersData[donorId].weeklyDonated || 0) + donationAmount;
            usersData[donorId].lastDonation = new Date().toISOString();
            usersData[donorId].currentTier = currentTier;

            statsData.totalDonations += donationAmount;

            saveUsers(usersData);
            saveStats(statsData);

            const requirement = currentTier === 2
                ? TIER_2_REQUIREMENT
                : TIER_1_REQUIREMENT + (usersData[donorId].missedAmount || 0);

            const donationEmbed = new EmbedBuilder()
                .setTitle('<:prize:1000016483369369650>  New Donation')
                .setColor('#4c00b0')
                .setDescription(
                    `<@${donorId}> donated ⏣ ${formatNumber(donationAmount)}\n\n` +
                    `<:purpledot:860074414853586984>  Weekly Progress: ⏣ ${formatNumber(usersData[donorId].weeklyDonated)}/${formatNumber(requirement)}`
                )
                .setTimestamp();

            await newMessage.channel.send({ embeds: [donationEmbed] });

            // Update leaderboard in background so donation response is instant
            setImmediate(() => updateStatusBoard(client).catch(console.error));

        } catch (e) {
            console.error('[MUPDATE] Unhandled error in execute:', e);
        }
    },
};