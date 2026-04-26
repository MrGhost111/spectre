// Donations/dankDetection.js
// Shared logic for detecting Dank Memer donation confirmations and item info
// embeds. Used by both messageCreate and messageUpdate so slash-command and
// text-command flows are both caught.

const { updateItemPrice, getItemPrice } = require('./itemPriceCache');
const { recordDonation, formatFull } = require('./noteSystem');
const { handleDonationFlow, stripEmojiMarkup, GIVEAWAY_CHANNEL_ID, EVENT_CHANNEL_ID, DANK_MEMER_BOT_ID } = require('./donationFlow');
const {
    loadUsers, loadStats, saveUsers, saveStats,
    formatNumber, updateStatusBoard,
    TIER_1_ROLE_ID, TIER_2_ROLE_ID,
    TIER_1_REQUIREMENT, TIER_2_REQUIREMENT,
} = require('../donationSystem');
const { EmbedBuilder } = require('discord.js');

const TRANSACTION_CHANNEL_ID = '833246120389902356';
const FLOW_CHANNELS = new Set([GIVEAWAY_CHANNEL_ID, EVENT_CHANNEL_ID]);

// ─── Dedup: prevent re-processing the same message ID ────────────────────────
// Both messageCreate AND messageUpdate can fire for the same Dank Memer message
// (slash = create fires fully formed; text = update fires after embed edit).
// Staff replies also cause messageUpdate to re-fire on the original message.
// We track processed IDs so each message is only ever handled once.
const processedIds = new Set();

function isAlreadyProcessed(messageId) {
    return processedIds.has(messageId);
}

function markProcessed(messageId) {
    processedIds.add(messageId);
    setTimeout(() => processedIds.delete(messageId), 600_000); // clean up after 10 min
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractComponentText(components = []) {
    let text = '';
    for (const c of components) {
        if (typeof c.content === 'string') text += c.content + '\n';
        if (Array.isArray(c.components)) text += extractComponentText(c.components);
    }
    return text;
}

function buildFullText(message) {
    let text = message.content || '';
    for (const embed of message.embeds || []) {
        if (embed.description) text += '\n' + embed.description;
        if (embed.fields) text += '\n' + embed.fields.map(f => f.name + ' ' + f.value).join('\n');
    }
    if (message.components?.length) {
        text += '\n' + extractComponentText(message.components);
    }
    return text;
}

// ─── Item info embed parser ───────────────────────────────────────────────────
// embed.title          → item name
// embed.fields[?].name === 'Market' → value contains "Average Value: ⏣ X"
function parseItemInfoEmbed(embeds) {
    if (!embeds?.length) return null;
    const embed = embeds[0];
    if (!embed.title || !embed.fields?.length) return null;

    const marketField = embed.fields.find(f => f.name === 'Market');
    if (!marketField) return null;

    const avgMatch = marketField.value.match(/Average Value:\s*⏣\s*([\d,]+)/);
    if (!avgMatch) return null;

    const marketAvgValue = parseInt(avgMatch[1].replace(/,/g, ''), 10);
    if (isNaN(marketAvgValue) || marketAvgValue <= 0) return null;

    const netField = embed.fields.find(f => f.name === 'Net Value');
    const netValue = netField ? parseInt(netField.value.replace(/[^0-9]/g, ''), 10) : null;

    return {
        itemName: embed.title.trim(),
        marketAvgValue,
        netValue: (netValue && !isNaN(netValue)) ? netValue : null,
    };
}

// ─── Donation prize parser ────────────────────────────────────────────────────
// Coin:  "Successfully donated **⏣ 50,000,000**"
// Item:  "Successfully donated **1 <:emoji:id> Item Name**"
function parsePrize(fullText) {
    const coinMatch = fullText.match(/Successfully donated \*\*⏣\s*([\d,]+)\*\*/);
    if (coinMatch) {
        const coinAmount = parseInt(coinMatch[1].replace(/,/g, ''), 10);
        return {
            prizeText: `⏣ ${formatFull(coinAmount)}`,
            isCoins: true,
            coinAmount: isNaN(coinAmount) ? 0 : coinAmount,
            rawItemName: null,
        };
    }

    const itemMatch = fullText.match(/Successfully donated \*\*([^*]+)\*\*/);
    if (itemMatch) {
        const rawItem = itemMatch[1].trim();
        const cleanItem = stripEmojiMarkup(rawItem);

        // Try to extract just the item name (strip leading quantity e.g. "1 ")
        const nameMatch = cleanItem.match(/^\d+\s+(.+)$/);
        const rawItemName = nameMatch ? nameMatch[1].trim() : cleanItem;

        return {
            prizeText: cleanItem,
            isCoins: false,
            coinAmount: 0,
            rawItemName,
        };
    }

    return null;
}

// ─── Main handler — called from both messageCreate and messageUpdate ───────────

async function handleDankMessage(client, message) {
    // Must be Dank Memer
    if (message.author?.id !== DANK_MEMER_BOT_ID) return;

    const fullText = buildFullText(message);

    // ── Item info embed (Average Value detection) ─────────────────────────────
    if (fullText.includes('Average Value:')) {
        const itemInfo = parseItemInfoEmbed(message.embeds);
        if (itemInfo) {
            updateItemPrice(itemInfo.itemName, itemInfo.marketAvgValue, itemInfo.netValue);
            console.log(
                `[DankDetect] 📦 Item price cached: "${itemInfo.itemName}" ` +
                `→ avg ⏣ ${itemInfo.marketAvgValue.toLocaleString()}` +
                (itemInfo.netValue ? ` | net ⏣ ${itemInfo.netValue.toLocaleString()}` : '')
            );
        }
    }

    // ── Donation detection ────────────────────────────────────────────────────
    if (!fullText.includes('Successfully donated')) return;

    // Dedup — skip if already handled (covers: slash→create, text→update, staff reply→update)
    if (isAlreadyProcessed(message.id)) {
        console.log(`[DankDetect] ⏭️  Already processed ${message.id}, skipping.`);
        return;
    }
    markProcessed(message.id);

    const prizeInfo = parsePrize(fullText);
    if (!prizeInfo) {
        console.warn('[DankDetect] Could not parse prize from:\n', fullText);
        return;
    }

    let { prizeText, isCoins, coinAmount, rawItemName } = prizeInfo;

    if (isCoins && coinAmount <= 0) {
        console.warn('[DankDetect] Invalid coin amount:', fullText);
        return;
    }

    // Enrich item prizeText with cached price if available
    if (!isCoins && rawItemName) {
        const cached = getItemPrice(rawItemName);
        if (cached) {
            prizeText = `${prizeText} (avg ⏣ ${cached.marketAvgValue.toLocaleString()})`;
        }
    }

    // Resolve donor
    const donorId = message.interactionMetadata?.user?.id
        ?? message.interaction?.user?.id
        ?? null;

    if (!donorId) {
        console.warn('[DankDetect] Could not resolve donor ID. Prize:', prizeText);
        return;
    }

    const channelId = message.channel?.id;
    const isTransactionChannel = channelId === TRANSACTION_CHANNEL_ID;
    const isFlowChannel = FLOW_CHANNELS.has(channelId);

    console.log(`[DankDetect] ✅ Donation: ${prizeText} from ${donorId} in ${channelId}`);

    // ═══════════════════════════════════════════════════════════════════════════
    // BRANCH A — Transaction channel: money maker + note (no log embed)
    // ═══════════════════════════════════════════════════════════════════════════
    if (isTransactionChannel && isCoins) {
        const guild = client.guilds.cache.first();
        const member = await guild.members.fetch(donorId).catch(() => null);
        if (!member) { console.warn('[DankDetect] Member not found:', donorId); return; }

        const isTier2 = member.roles.cache.has(TIER_2_ROLE_ID);
        const isTier1 = member.roles.cache.has(TIER_1_ROLE_ID);
        const currentTier = isTier2 ? 2 : isTier1 ? 1 : 0;

        const usersData = loadUsers();
        const statsData = loadStats();

        if (!usersData[donorId]) {
            usersData[donorId] = {
                totalDonated: 0, weeklyDonated: 0, missedAmount: 0,
                currentTier, status: 'good', lastDonation: null,
            };
        }

        usersData[donorId].totalDonated = (usersData[donorId].totalDonated || 0) + coinAmount;
        usersData[donorId].weeklyDonated = (usersData[donorId].weeklyDonated || 0) + coinAmount;
        usersData[donorId].lastDonation = new Date().toISOString();
        usersData[donorId].currentTier = currentTier;
        statsData.totalDonations = (statsData.totalDonations || 0) + coinAmount;

        saveUsers(usersData);
        saveStats(statsData);

        const regularAmount = isTier2 ? Math.round(coinAmount * 1.25) : coinAmount;
        const { total: newRegularTotal } = await recordDonation(
            client, donorId, regularAmount, null, message
        );

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

        await message.channel.send({ embeds: [confirmEmbed] });
        console.log('[DankDetect] ✅ Money maker confirmation sent');

        setImmediate(() => updateStatusBoard(client).catch(err =>
            console.error('[DankDetect] updateStatusBoard failed:', err)
        ));
        return;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BRANCH B — Giveaway / Event channel: auto-note + interactive flow
    // ═══════════════════════════════════════════════════════════════════════════
    if (isFlowChannel) {
        if (isCoins && coinAmount > 0) {
            await recordDonation(client, donorId, coinAmount, message.channel, message);
            console.log(`[DankDetect] ✅ Coins auto-noted for ${donorId} in flow channel`);
        } else if (!isCoins && rawItemName) {
            const cached = getItemPrice(rawItemName);
            if (cached) {
                await recordDonation(client, donorId, cached.marketAvgValue, message.channel, message);
                console.log(`[DankDetect] ✅ Item auto-noted: "${rawItemName}" → ⏣ ${cached.marketAvgValue.toLocaleString()}`);
            } else {
                console.log(`[DankDetect] ⚠️  No cached price for "${rawItemName}" — staff must note manually`);
            }
        }

        handleDonationFlow(client, channelId, message.channel, donorId, prizeText, isCoins, coinAmount)
            .catch(e => console.error('[DankDetect] handleDonationFlow error:', e));
        return;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BRANCH C — Any other channel
    // ═══════════════════════════════════════════════════════════════════════════
    if (isCoins) {
        await recordDonation(client, donorId, coinAmount, message.channel, message);
        console.log('[DankDetect] ✅ Regular donation recorded for', donorId);
    } else if (rawItemName) {
        const cached = getItemPrice(rawItemName);
        if (cached) {
            await recordDonation(client, donorId, cached.marketAvgValue, message.channel, message);
            console.log(`[DankDetect] ✅ Item auto-noted (other ch): "${rawItemName}" → ⏣ ${cached.marketAvgValue.toLocaleString()}`);
        } else {
            console.log(`[DankDetect] Item outside flow, no cached price for "${rawItemName}"`);
        }
    }
}

module.exports = { handleDankMessage };