// events/mupdate.js
// Responsibilities:
//   1. Track edited messages for snipe
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

            // ── Donation detection ────────────────────────────────────────────
            // Only care about Dank Memer edits in the transaction channel
            if (
                newMessage.channel?.id !== TRANSACTION_CHANNEL_ID ||
                newMessage.author?.id !== DANK_MEMER_BOT_ID
            ) return;

            // Must have embeds
            if (!newMessage.embeds?.length) return;

            const embed = newMessage.embeds[0];
            if (!embed.description?.includes('Successfully donated')) return;

            // Parse donation amount
            const donationMatch = embed.description.match(
                /Successfully donated \*\*⏣\s*([\d,]+)\*\*/
            );
            if (!donationMatch) {
                console.warn('[MUPDATE] Donation message matched but amount regex failed. Description:', embed.description);
                return;
            }

            const donationAmount = parseInt(donationMatch[1].replace(/,/g, ''), 10);
            if (isNaN(donationAmount) || donationAmount <= 0) {
                console.warn('[MUPDATE] Parsed donation amount is invalid:', donationMatch[1]);
                return;
            }

            // Resolve donor
            const donorId = await findCommandUser(newMessage);
            if (!donorId) {
                console.warn('[MUPDATE] Could not resolve donor ID for donation of', donationAmount);
                return;
            }

            // Fetch member to get their current tier from actual roles
            const guild = client.guilds.cache.first();
            const member = await guild.members.fetch(donorId).catch(() => null);
            if (!member) {
                console.warn(`[MUPDATE] Member ${donorId} not found in guild`);
                return;
            }

            const currentTier = member.roles.cache.has(TIER_2_ROLE_ID) ? 2
                : member.roles.cache.has(TIER_1_ROLE_ID) ? 1
                    : 0;

            // ── Read fresh data from disk, update, write back ─────────────────
            const usersData = loadUsers();
            const statsData = loadStats();

            if (!usersData[donorId]) {
                usersData[donorId] = {
                    totalDonated: 0,
                    weeklyDonated: 0,
                    missedAmount: 0,
                    currentTier,
                    status: 'good',
                    lastDonation: null,
                };
            }

            usersData[donorId].totalDonated = (usersData[donorId].totalDonated || 0) + donationAmount;
            usersData[donorId].weeklyDonated = (usersData[donorId].weeklyDonated || 0) + donationAmount;
            usersData[donorId].lastDonation = new Date().toISOString();
            usersData[donorId].currentTier = currentTier;

            statsData.totalDonations = (statsData.totalDonations || 0) + donationAmount;

            saveUsers(usersData);
            saveStats(statsData);

            // ── Send confirmation embed ───────────────────────────────────────
            const requirement = currentTier === 2
                ? TIER_2_REQUIREMENT
                : TIER_1_REQUIREMENT + (usersData[donorId].missedAmount || 0);

            const confirmEmbed = new EmbedBuilder()
                .setTitle('<:prize:1000016483369369650>  New Donation')
                .setColor('#4c00b0')
                .setDescription(
                    `<@${donorId}> donated ⏣ ${formatNumber(donationAmount)}\n\n` +
                    `<:purpledot:860074414853586984>  Weekly Progress: ⏣ ${formatNumber(usersData[donorId].weeklyDonated)}/${formatNumber(requirement)}`
                )
                .setTimestamp();

            await newMessage.channel.send({ embeds: [confirmEmbed] });

            // ── Update leaderboard in background ─────────────────────────────
            // setImmediate so the confirmation message sends first
            setImmediate(() => updateStatusBoard(client).catch(err =>
                console.error('[MUPDATE] updateStatusBoard failed:', err)
            ));

        } catch (e) {
            console.error('[MUPDATE] Unhandled error:', e);
        }
    },
};
