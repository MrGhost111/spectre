// events/mupdate.js
// Responsibilities:
//   1. Track edited messages for snipe
//   2. Detect Dank Memer donation confirmations (Components V2 format) — everywhere
//   3. If in transaction channel → money maker logic + regular donation (1.25x for Tier 2)
//   4. If outside transaction channel → regular donation only

const { EmbedBuilder, Events } = require('discord.js');
const {
    loadUsers,
    loadStats,
    saveUsers,
    saveStats,
    formatNumber,
    updateStatusBoard,
    TIER_1_ROLE_ID,
    TIER_2_ROLE_ID,
    TIER_1_REQUIREMENT,
    TIER_2_REQUIREMENT,
} = require('../donationSystem');
const { recordDonation } = require('../Donations/noteSystem');

const TRANSACTION_CHANNEL_ID = '833246120389902356';
const DANK_MEMER_BOT_ID      = '270904126974590976';

// Recursively pull all .content strings from Components V2 tree
function extractComponentText(components = []) {
    let text = '';
    for (const c of components) {
        if (typeof c.content === 'string') text += c.content + '\n';
        if (Array.isArray(c.components)) text += extractComponentText(c.components);
    }
    return text;
}

module.exports = {
    name: Events.MessageUpdate,

    async execute(client, oldMessage, newMessage) {
        try {
            // ── Fetch full message if partial ─────────────────────────────────
            if (newMessage.partial) {
                try { await newMessage.fetch(); }
                catch (e) { console.error('[MUPDATE] Failed to fetch partial:', e); return; }
            }

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
                    author:     newMessage.author?.tag,
                    oldContent: oldMessage.content,
                    newContent: newMessage.content,
                    timestamp:  Math.floor(Date.now() / 1000),
                    messageId:  newMessage.id,
                });
                client.editedMessages.set(newMessage.channel.id, channelEdits);
            }

            // ── Only care about Dank Memer ────────────────────────────────────
            if (newMessage.author?.id !== DANK_MEMER_BOT_ID) return;

            // ── Build full searchable text from all message parts ─────────────
            let fullText = newMessage.content || '';
            for (const embed of newMessage.embeds || []) {
                if (embed.description) fullText += '\n' + embed.description;
            }
            if (newMessage.components?.length) {
                fullText += '\n' + extractComponentText(newMessage.components);
            }

            if (!fullText.includes('Successfully donated')) return;

            // ── Parse amount ──────────────────────────────────────────────────
            const match = fullText.match(/Successfully donated \*\*⏣\s*([\d,]+)\*\*/);
            if (!match) {
                console.warn('[MUPDATE] Could not parse amount. Full text was:\n', fullText);
                return;
            }

            const donationAmount = parseInt(match[1].replace(/,/g, ''), 10);
            if (isNaN(donationAmount) || donationAmount <= 0) {
                console.warn('[MUPDATE] Invalid amount parsed:', match[1]);
                return;
            }

            // ── Resolve donor ─────────────────────────────────────────────────
            const donorId = newMessage.interactionMetadata?.user?.id
                ?? newMessage.interaction?.user?.id
                ?? null;

            if (!donorId) {
                console.warn('[MUPDATE] Could not resolve donor ID. Amount:', donationAmount);
                return;
            }

            console.log(`[MUPDATE] ✅ Donation detected: ⏣ ${donationAmount} from ${donorId} in channel ${newMessage.channel.id}`);

            const isTransactionChannel = newMessage.channel?.id === TRANSACTION_CHANNEL_ID;

            // ═════════════════════════════════════════════════════════════════
            // BRANCH A — Transaction channel: money maker + regular donation
            // ═════════════════════════════════════════════════════════════════
            if (isTransactionChannel) {
                const guild  = client.guilds.cache.first();
                const member = await guild.members.fetch(donorId).catch(() => null);
                if (!member) {
                    console.warn('[MUPDATE] Member not found:', donorId);
                    return;
                }

                const isTier2   = member.roles.cache.has(TIER_2_ROLE_ID);
                const isTier1   = member.roles.cache.has(TIER_1_ROLE_ID);
                const currentTier = isTier2 ? 2 : isTier1 ? 1 : 0;

                // ── Money maker: load → update → save ─────────────────────────
                const usersData = loadUsers();
                const statsData = loadStats();

                if (!usersData[donorId]) {
                    usersData[donorId] = {
                        totalDonated:  0,
                        weeklyDonated: 0,
                        missedAmount:  0,
                        currentTier,
                        status:       'good',
                        lastDonation:  null,
                    };
                }

                usersData[donorId].totalDonated  = (usersData[donorId].totalDonated  || 0) + donationAmount;
                usersData[donorId].weeklyDonated = (usersData[donorId].weeklyDonated || 0) + donationAmount;
                usersData[donorId].lastDonation  = new Date().toISOString();
                usersData[donorId].currentTier   = currentTier;
                statsData.totalDonations         = (statsData.totalDonations || 0) + donationAmount;

                saveUsers(usersData);
                saveStats(statsData);

                // ── Regular donation: 1.25x for Tier 2, raw for Tier 1 ────────
                const regularAmount = isTier2 ? Math.round(donationAmount * 1.25) : donationAmount;
                const { total: newRegularTotal } = await recordDonation(client, donorId, regularAmount);

                // ── Money maker confirmation embed ────────────────────────────
                const requirement = isTier2
                    ? TIER_2_REQUIREMENT
                    : TIER_1_REQUIREMENT + (usersData[donorId].missedAmount || 0);

                const confirmEmbed = new EmbedBuilder()
                    .setTitle('<:prize:1000016483369369650>  New Donation')
                    .setColor('#4c00b0')
                    .setDescription(
                        `<@${donorId}> donated ⏣ ${formatNumber(donationAmount)}\n\n` +
                        `<:purpledot:860074414853586984>  Weekly Progress: ⏣ ${formatNumber(usersData[donorId].weeklyDonated)}/${formatNumber(requirement)}`
                    )
                    .addFields({
                        name:  '📊 Overall Donation Total',
                        value: `⏣ ${formatNumber(newRegularTotal)}` +
                               (isTier2 ? ` *(includes 1.25× Tier 2 bonus — ⏣ ${formatNumber(regularAmount)} credited)*` : ''),
                        inline: false,
                    })
                    .setTimestamp();

                await newMessage.channel.send({ embeds: [confirmEmbed] });
                console.log('[MUPDATE] ✅ Money maker confirmation sent');

                // ── Update leaderboard in background ──────────────────────────
                setImmediate(() => updateStatusBoard(client).catch(err =>
                    console.error('[MUPDATE] updateStatusBoard failed:', err)
                ));

            // ═════════════════════════════════════════════════════════════════
            // BRANCH B — Any other channel: regular donation only
            // ═════════════════════════════════════════════════════════════════
            } else {
                await recordDonation(client, donorId, donationAmount);
                console.log('[MUPDATE] ✅ Regular donation recorded for', donorId);
            }

        } catch (e) {
            console.error('[MUPDATE] Unhandled error:', e);
        }
    },
};
