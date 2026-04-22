// events/mupdate.js
// Responsibilities:
//   1. Track edited messages for snipe
//   2. Detect Dank Memer donation confirmations (Components V2 format) — everywhere
//   3. If in transaction channel → money maker logic + regular donation (1.25x for Tier 2)
//      NOTE: recordDonation log embed is suppressed here — totals shown in "New Donation" embed
//   4. If outside transaction channel → regular donation only
//   5. If in giveaway/event channel → trigger interactive donation flow

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
const { recordDonation, formatFull } = require('../Donations/noteSystem');
const {
    handleDonationFlow,
    stripEmojiMarkup,
    GIVEAWAY_CHANNEL_ID,
    EVENT_CHANNEL_ID,
    DANK_MEMER_BOT_ID,
} = require('../Donations/donationFlow');

const TRANSACTION_CHANNEL_ID = '833246120389902356';

// Channels where we trigger the interactive flow
const FLOW_CHANNELS = new Set([GIVEAWAY_CHANNEL_ID, EVENT_CHANNEL_ID]);

// Recursively pull all .content strings from Components V2 tree
function extractComponentText(components = []) {
    let text = '';
    for (const c of components) {
        if (typeof c.content === 'string') text += c.content + '\n';
        if (Array.isArray(c.components)) text += extractComponentText(c.components);
    }
    return text;
}

/**
 * Parse prize info from the "Successfully donated" message.
 * Returns { prizeText, isCoins, coinAmount } or null.
 *
 * Coin format:  "Successfully donated **⏣ 50,000,000**"
 * Item format:  "Successfully donated **1 <:AdventureTicket:934112100970807336> Adventure Ticket**"
 */
function parsePrize(fullText) {
    // Try coin match first (has ⏣ symbol)
    const coinMatch = fullText.match(/Successfully donated \*\*⏣\s*([\d,]+)\*\*/);
    if (coinMatch) {
        const coinAmount = parseInt(coinMatch[1].replace(/,/g, ''), 10);
        return {
            prizeText:  `⏣ ${formatFull(coinAmount)}`,
            isCoins:    true,
            coinAmount: isNaN(coinAmount) ? 0 : coinAmount,
        };
    }

    // Item match — grab everything between ** after "Successfully donated", strip emoji markup
    const itemMatch = fullText.match(/Successfully donated \*\*([^*]+)\*\*/);
    if (itemMatch) {
        const rawItem   = itemMatch[1].trim();
        const cleanItem = stripEmojiMarkup(rawItem);
        return {
            prizeText:  cleanItem,
            isCoins:    false,
            coinAmount: 0,
        };
    }

    return null;
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

            // ── Build full searchable text ────────────────────────────────────
            let fullText = newMessage.content || '';
            for (const embed of newMessage.embeds || []) {
                if (embed.description) fullText += '\n' + embed.description;
            }
            if (newMessage.components?.length) {
                fullText += '\n' + extractComponentText(newMessage.components);
            }

            if (!fullText.includes('Successfully donated')) return;

            // ── Parse prize ───────────────────────────────────────────────────
            const prizeInfo = parsePrize(fullText);
            if (!prizeInfo) {
                console.warn('[MUPDATE] Could not parse prize from:\n', fullText);
                return;
            }

            const { prizeText, isCoins, coinAmount } = prizeInfo;

            if (isCoins && coinAmount <= 0) {
                console.warn('[MUPDATE] Invalid coin amount parsed from:', fullText);
                return;
            }

            // ── Resolve donor ─────────────────────────────────────────────────
            const donorId = newMessage.interactionMetadata?.user?.id
                ?? newMessage.interaction?.user?.id
                ?? null;

            if (!donorId) {
                console.warn('[MUPDATE] Could not resolve donor ID. Prize:', prizeText);
                return;
            }

            const channelId = newMessage.channel?.id;
            console.log(`[MUPDATE] ✅ Donation detected: ${prizeText} from ${donorId} in channel ${channelId}`);

            const isTransactionChannel = channelId === TRANSACTION_CHANNEL_ID;
            const isFlowChannel        = FLOW_CHANNELS.has(channelId);

            // ═════════════════════════════════════════════════════════════════
            // BRANCH A — Transaction channel: money maker + note (no log embed)
            // ═════════════════════════════════════════════════════════════════
            if (isTransactionChannel && isCoins) {
                const guild  = client.guilds.cache.first();
                const member = await guild.members.fetch(donorId).catch(() => null);
                if (!member) {
                    console.warn('[MUPDATE] Member not found:', donorId);
                    return;
                }

                const isTier2     = member.roles.cache.has(TIER_2_ROLE_ID);
                const isTier1     = member.roles.cache.has(TIER_1_ROLE_ID);
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

                usersData[donorId].totalDonated  = (usersData[donorId].totalDonated  || 0) + coinAmount;
                usersData[donorId].weeklyDonated = (usersData[donorId].weeklyDonated || 0) + coinAmount;
                usersData[donorId].lastDonation  = new Date().toISOString();
                usersData[donorId].currentTier   = currentTier;
                statsData.totalDonations         = (statsData.totalDonations || 0) + coinAmount;

                saveUsers(usersData);
                saveStats(statsData);

                // ── Regular donation: 1.25x for Tier 2 ────────────────────────
                // Pass null for channel & message so recordDonation skips sending
                // its own "Donation Recorded" embed — we show totals in our embed below
                const regularAmount = isTier2 ? Math.round(coinAmount * 1.25) : coinAmount;
                const { total: newRegularTotal } = await recordDonation(
                    client, donorId, regularAmount,
                    null,  // ← no source channel → suppresses the log embed in channel
                    newMessage
                );

                // ── Money maker confirmation embed ────────────────────────────
                const requirement = isTier2
                    ? TIER_2_REQUIREMENT
                    : TIER_1_REQUIREMENT + (usersData[donorId].missedAmount || 0);

                const confirmEmbed = new EmbedBuilder()
                    .setTitle('<:prize:1000016483369369650>  New Donation')
                    .setColor('#4c00b0')
                    .setDescription(
                        `<@${donorId}> donated ⏣ ${formatNumber(coinAmount)}\n\n` +
                        `<:purpledot:860074414853586984>  Weekly Progress: ⏣ ${formatNumber(usersData[donorId].weeklyDonated)}/${formatNumber(requirement)}`
                    )
                    .addFields({
                        name:  '<:req:1000019378730975282> Overall Donation Total',
                        value: `⏣ ${formatNumber(newRegularTotal)}` +
                               (isTier2 ? ` *(includes 1.25× Tier 2 bonus — ⏣ ${formatNumber(regularAmount)} credited)*` : ''),
                        inline: false,
                    })
                    .setTimestamp();

                await newMessage.channel.send({ embeds: [confirmEmbed] });
                console.log('[MUPDATE] ✅ Money maker confirmation sent');

                setImmediate(() => updateStatusBoard(client).catch(err =>
                    console.error('[MUPDATE] updateStatusBoard failed:', err)
                ));

            // ═════════════════════════════════════════════════════════════════
            // BRANCH B — Giveaway / Event channel: flow + optional note
            // ═════════════════════════════════════════════════════════════════
            } else if (isFlowChannel) {
                if (isCoins && coinAmount > 0) {
                    await recordDonation(client, donorId, coinAmount, newMessage.channel, newMessage);
                    console.log(`[MUPDATE] ✅ Coins auto-noted for ${donorId} in flow channel`);
                } else {
                    console.log(`[MUPDATE] Item donation in flow channel for ${donorId} — staff must set note manually`);
                }

                handleDonationFlow(client, channelId, newMessage.channel, donorId, prizeText, isCoins, coinAmount)
                    .catch(e => console.error('[MUPDATE] handleDonationFlow error:', e));

            // ═════════════════════════════════════════════════════════════════
            // BRANCH C — Any other channel: regular coin donation only
            // ═════════════════════════════════════════════════════════════════
            } else if (isCoins) {
                await recordDonation(client, donorId, coinAmount, newMessage.channel, newMessage);
                console.log('[MUPDATE] ✅ Regular donation recorded for', donorId);
            } else {
                console.log('[MUPDATE] Item donation outside flow channels — no action for', donorId);
            }

        } catch (e) {
            console.error('[MUPDATE] Unhandled error:', e);
        }
    },
};
