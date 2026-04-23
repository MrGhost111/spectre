// events/mupdate.js
// Responsibilities:
//   1. Track edited messages for snipe
//   2. Detect Dank Memer donation confirmations (Components V2 format) — everywhere
//   3. If in transaction channel → money maker logic + regular donation (1.25x for Tier 2)
//      NOTE: recordDonation log embed is suppressed here — totals shown in "New Donation" embed
//   4. If outside transaction channel → regular donation only
//   5. If in giveaway/event channel → trigger interactive donation flow
//   6. Detect Dank Memer item info embeds (from /item) and auto-update item price cache

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
const { updateItemPrice, getItemPrice } = require('../Donations/itemPriceCache');

const TRANSACTION_CHANNEL_ID = '833246120389902356';

// Channels where we trigger the interactive flow
const FLOW_CHANNELS = new Set([GIVEAWAY_CHANNEL_ID, EVENT_CHANNEL_ID]);

// ─── Dedup: prevent re-processing the same donation message ──────────────────
// Fires when staff reply to the original Dank Memer message, causing another
// messageUpdate event on the same message ID. We track processed IDs so we
// never handle the same message twice.
const processedDonationIds = new Set();

function markProcessed(messageId) {
    processedDonationIds.add(messageId);
    // Clean up after 10 minutes to avoid unbounded memory growth
    setTimeout(() => processedDonationIds.delete(messageId), 600_000);
}

// ─── Recursively pull all .content strings from Components V2 tree ────────────
function extractComponentText(components = []) {
    let text = '';
    for (const c of components) {
        if (typeof c.content === 'string') text += c.content + '\n';
        if (Array.isArray(c.components)) text += extractComponentText(c.components);
    }
    return text;
}

// ─── Parse prize info from the "Successfully donated" message ─────────────────
// Returns { prizeText, isCoins, coinAmount } or null.
//
// Coin format:  "Successfully donated **⏣ 50,000,000**"
// Item format:  "Successfully donated **1 <:AdventureTicket:934112100970807336> Adventure Ticket**"
function parsePrize(fullText) {
    // Try coin match first (has ⏣ symbol)
    const coinMatch = fullText.match(/Successfully donated \*\*⏣\s*([\d,]+)\*\*/);
    if (coinMatch) {
        const coinAmount = parseInt(coinMatch[1].replace(/,/g, ''), 10);
        return {
            prizeText: `⏣ ${formatFull(coinAmount)}`,
            isCoins: true,
            coinAmount: isNaN(coinAmount) ? 0 : coinAmount,
        };
    }

    // Item match — grab everything between ** after "Successfully donated", strip emoji markup
    const itemMatch = fullText.match(/Successfully donated \*\*([^*]+)\*\*/);
    if (itemMatch) {
        const rawItem = itemMatch[1].trim();
        const cleanItem = stripEmojiMarkup(rawItem);
        return {
            prizeText: cleanItem,
            isCoins: false,
            coinAmount: 0,
        };
    }

    return null;
}

// ─── Parse item info embed from Dank Memer /item command ─────────────────────
// Returns { itemName, marketAvgValue, netValue } or null.
// Structure (from inspect):
//   embed.title          → item name  (e.g. "A Plus")
//   embed.fields[0].name → "Net Value",    .value → "⏣ 200,000"
//   embed.fields[1].name → "Market",       .value → "Average Value: ⏣ 6,000,000\nActive Offers: ..."
//   embed.footer.text    → "Epic Sellable" (confirms it's an item embed)
function parseItemInfoEmbed(embeds) {
    if (!embeds?.length) return null;
    const embed = embeds[0];

    // Must have a footer of "Epic Sellable" or similar — key signal this is an item embed
    // We check for the Market field containing "Average Value:" as the reliable anchor
    if (!embed.title || !embed.fields?.length) return null;

    const marketField = embed.fields.find(f => f.name === 'Market');
    if (!marketField) return null;

    const avgMatch = marketField.value.match(/Average Value:\s*⏣\s*([\d,]+)/);
    if (!avgMatch) return null;

    const marketAvgValue = parseInt(avgMatch[1].replace(/,/g, ''), 10);
    if (isNaN(marketAvgValue) || marketAvgValue <= 0) return null;

    // Net value (optional, for logging)
    const netField = embed.fields.find(f => f.name === 'Net Value');
    const netValue = netField
        ? parseInt(netField.value.replace(/[^0-9]/g, ''), 10)
        : null;

    return {
        itemName: embed.title.trim(),
        marketAvgValue,
        netValue: isNaN(netValue) ? null : netValue,
    };
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
                    author: newMessage.author?.tag,
                    oldContent: oldMessage.content,
                    newContent: newMessage.content,
                    timestamp: Math.floor(Date.now() / 1000),
                    messageId: newMessage.id,
                });
                client.editedMessages.set(newMessage.channel.id, channelEdits);
            }

            // ── Only care about Dank Memer ────────────────────────────────────
            if (newMessage.author?.id !== DANK_MEMER_BOT_ID) return;

            // ── Build full searchable text ────────────────────────────────────
            let fullText = newMessage.content || '';
            for (const embed of newMessage.embeds || []) {
                if (embed.description) fullText += '\n' + embed.description;
                if (embed.fields) fullText += '\n' + embed.fields.map(f => f.name + ' ' + f.value).join('\n');
            }
            if (newMessage.components?.length) {
                fullText += '\n' + extractComponentText(newMessage.components);
            }

            // ════════════════════════════════════════════════════════════════
            // BRANCH 0 — Item info embed: auto-cache the market average price
            // Triggered when someone uses /item and Dank Memer sends the embed.
            // We detect it by the presence of "Average Value:" in the field text.
            // ════════════════════════════════════════════════════════════════
            if (fullText.includes('Average Value:')) {
                const itemInfo = parseItemInfoEmbed(newMessage.embeds);
                if (itemInfo) {
                    updateItemPrice(itemInfo.itemName, itemInfo.marketAvgValue, itemInfo.netValue);
                    console.log(
                        `[MUPDATE] 📦 Item price cached: "${itemInfo.itemName}" ` +
                        `→ market avg ⏣ ${itemInfo.marketAvgValue.toLocaleString()}` +
                        (itemInfo.netValue ? ` | net ⏣ ${itemInfo.netValue.toLocaleString()}` : '')
                    );
                }
                // Don't return — in the very unlikely case a message has both,
                // we still want to fall through. But realistically this is a
                // separate embed type so it won't contain "Successfully donated".
            }

            // ── Donation gate ─────────────────────────────────────────────────
            if (!fullText.includes('Successfully donated')) return;

            // ── DEDUP: skip if we already processed this message ──────────────
            // This prevents double-counting when staff reply to the original
            // Dank Memer message, which causes another messageUpdate event.
            if (processedDonationIds.has(newMessage.id)) {
                console.log(`[MUPDATE] ⏭️  Already processed message ${newMessage.id}, skipping.`);
                return;
            }
            markProcessed(newMessage.id);

            // ── Parse prize ───────────────────────────────────────────────────
            const prizeInfo = parsePrize(fullText);
            if (!prizeInfo) {
                console.warn('[MUPDATE] Could not parse prize from:\n', fullText);
                return;
            }

            const { isCoins, coinAmount } = prizeInfo;
            let { prizeText } = prizeInfo;

            if (isCoins && coinAmount <= 0) {
                console.warn('[MUPDATE] Invalid coin amount parsed from:', fullText);
                return;
            }

            // ── For item donations: try to enrich prizeText with cached price ─
            // e.g. "1 A Plus" → "1 A Plus (⏣ 6,000,000 avg)"
            if (!isCoins) {
                // Extract item name from prizeText: strip leading quantity if present ("1 A Plus" → "A Plus")
                const itemNameMatch = prizeText.match(/^\d+\s+(.+)$/);
                const itemName = itemNameMatch ? itemNameMatch[1] : prizeText;
                const cachedPrice = getItemPrice(itemName);
                if (cachedPrice) {
                    prizeText = `${prizeText} (avg ⏣ ${cachedPrice.marketAvgValue.toLocaleString()})`;
                }
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
            const isFlowChannel = FLOW_CHANNELS.has(channelId);

            // ═════════════════════════════════════════════════════════════════
            // BRANCH A — Transaction channel: money maker + note (no log embed)
            // ═════════════════════════════════════════════════════════════════
            if (isTransactionChannel && isCoins) {
                const guild = client.guilds.cache.first();
                const member = await guild.members.fetch(donorId).catch(() => null);
                if (!member) {
                    console.warn('[MUPDATE] Member not found:', donorId);
                    return;
                }

                const isTier2 = member.roles.cache.has(TIER_2_ROLE_ID);
                const isTier1 = member.roles.cache.has(TIER_1_ROLE_ID);
                const currentTier = isTier2 ? 2 : isTier1 ? 1 : 0;

                // ── Money maker: load → update → save ─────────────────────────
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

                usersData[donorId].totalDonated = (usersData[donorId].totalDonated || 0) + coinAmount;
                usersData[donorId].weeklyDonated = (usersData[donorId].weeklyDonated || 0) + coinAmount;
                usersData[donorId].lastDonation = new Date().toISOString();
                usersData[donorId].currentTier = currentTier;
                statsData.totalDonations = (statsData.totalDonations || 0) + coinAmount;

                saveUsers(usersData);
                saveStats(statsData);

                // ── Regular donation: 1.25x for Tier 2 ────────────────────────
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
                        name: '<:req:1000019378730975282> Overall Donation Total',
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
                } else if (!isCoins) {
                    // Item donation — try to auto-note using cached price
                    const itemNameMatch = prizeText.match(/^\d+\s+(.+?)(?:\s*\(avg)?/);
                    const itemName = itemNameMatch ? itemNameMatch[1].trim() : prizeText;
                    const cachedPrice = getItemPrice(itemName);

                    if (cachedPrice) {
                        await recordDonation(
                            client, donorId, cachedPrice.marketAvgValue,
                            newMessage.channel, newMessage
                        );
                        console.log(
                            `[MUPDATE] ✅ Item auto-noted for ${donorId}: "${itemName}" ` +
                            `→ ⏣ ${cachedPrice.marketAvgValue.toLocaleString()} (cached avg)`
                        );
                    } else {
                        console.log(
                            `[MUPDATE] ⚠️  Item donation for ${donorId} ("${itemName}") — ` +
                            `no cached price found. Staff must set note manually. ` +
                            `Tip: use /item on this item first to cache its price.`
                        );
                    }
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
                // Item outside flow channels — try auto-note from cache
                const itemNameMatch = prizeText.match(/^\d+\s+(.+?)(?:\s*\(avg)?/);
                const itemName = itemNameMatch ? itemNameMatch[1].trim() : prizeText;
                const cachedPrice = getItemPrice(itemName);

                if (cachedPrice) {
                    await recordDonation(
                        client, donorId, cachedPrice.marketAvgValue,
                        newMessage.channel, newMessage
                    );
                    console.log(
                        `[MUPDATE] ✅ Item auto-noted (other channel) for ${donorId}: ` +
                        `"${itemName}" → ⏣ ${cachedPrice.marketAvgValue.toLocaleString()}`
                    );
                } else {
                    console.log('[MUPDATE] Item donation outside flow channels — no cached price for', donorId, prizeText);
                }
            }

        } catch (e) {
            console.error('[MUPDATE] Unhandled error:', e);
        }
    },
};