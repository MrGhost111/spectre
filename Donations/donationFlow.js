// Donations/donationFlow.js
// Handles the interactive post-donation Q&A flow for giveaway and event/heist channels.

const { EmbedBuilder } = require('discord.js');

const GIVEAWAY_CHANNEL_ID = '715528041673129984';
const EVENT_CHANNEL_ID = '762204827131838515';
const STAFF_ROLE_ID = '712970141834674207';
const DANK_MEMER_BOT_ID = '270904126974590976';

const PROMPT_TIMEOUT_MS = 5 * 60 * 1000;
const PROMPT_TIMEOUT_MESSAGE_MS = 10 * 60 * 1000;

const STICKY_CONTENT = 'Want to sponsor a giveaway or event? Use </serverevents donate:1011560371267579936> to get started!';

const activeSessions = new Map();
const stickyMessages = new Map();
const stickyTimers = new Map();
const STICKY_DELAY_MS = 30_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a human-readable prize string from the session's prize list.
 *
 * Coins are summed with a breakdown if donated multiple times.
 * Items are grouped by name; each group shows:
 *   qty × Name
 *   ⏣ total  (⏣ X each)          ← only when price is known
 *   (N + M across donations)     ← only when donated more than once
 */
function buildPrizeString(prizes) {
    const coinPrizes = prizes.filter(p => p.isCoins);
    const itemPrizes = prizes.filter(p => !p.isCoins);
    const groups = [];

    // ── Coins ─────────────────────────────────────────────────────────────────
    if (coinPrizes.length === 1) {
        groups.push(`⏣ ${(coinPrizes[0].amount || 0).toLocaleString()}`);
    } else if (coinPrizes.length > 1) {
        const total = coinPrizes.reduce((sum, p) => sum + (p.amount || 0), 0);
        const parts = coinPrizes.map(p => `⏣ ${(p.amount || 0).toLocaleString()}`).join(' + ');
        groups.push(`⏣ ${total.toLocaleString()} (${parts})`);
    }

    // ── Items: group identical names, sum qty and value ───────────────────────
    // Prize text is "10 × Adventure Ticket" — parse name from that.
    const itemMap = new Map(); // name → { totalQty, totalValue, pricePerUnit, donations[] }

    for (const p of itemPrizes) {
        // Parse "10 × Adventure Ticket" format (× or x, case-insensitive)
        const crossMatch = p.text.match(/^(\d+)\s*[×x]\s*(.+)$/i);
        const qty = crossMatch ? parseInt(crossMatch[1], 10) : (p.itemQty || 1);
        const name = crossMatch ? crossMatch[2].trim() : p.text.trim();

        if (itemMap.has(name)) {
            const entry = itemMap.get(name);
            entry.totalQty += qty;
            entry.totalValue += (p.amount || 0);
            entry.donations.push(qty);
        } else {
            itemMap.set(name, {
                totalQty: qty,
                totalValue: p.amount || 0,
                pricePerUnit: p.pricePerUnit || null,
                donations: [qty],
            });
        }
    }

    for (const [name, entry] of itemMap) {
        // Line 1: quantity and name
        let line = `**${entry.totalQty} × ${name}**`;

        // Line 2: value info (only when we have a cached price)
        if (entry.totalValue > 0) {
            line += `\n⏣ ${entry.totalValue.toLocaleString()} total`;
            if (entry.pricePerUnit && entry.totalQty > 1) {
                line += ` (⏣ ${entry.pricePerUnit.toLocaleString()} each)`;
            }
        }

        // Line 3: donation breakdown if donated in multiple transactions
        if (entry.donations.length > 1) {
            line += `\n*(${entry.donations.join(' + ')} across ${entry.donations.length} donations)*`;
        }

        groups.push(line);
    }

    return groups.join('\n\n') || 'Unknown';
}

function hasCoinPrize(prizes) {
    return prizes.some(p => p.isCoins);
}

async function safeDelete(msg) {
    if (!msg) return;
    await msg.delete().catch(() => { });
}

/**
 * Strip Discord custom emoji markup from a string.
 * "<:AdventureTicket:934112100970807336>" → ""
 */
function stripEmojiMarkup(text) {
    return text.replace(/<a?:[^:>]+:\d+>/g, '').replace(/\s{2,}/g, ' ').trim();
}

// ─── Sticky message handler ───────────────────────────────────────────────────

async function handleStickyMessage(channel, triggerMessage) {
    if (triggerMessage.author?.id === DANK_MEMER_BOT_ID) return;

    const existing = stickyMessages.get(channel.id);
    if (existing && triggerMessage.id === existing.messageId) return;

    for (const session of activeSessions.values()) {
        if (session.channel.id === channel.id) return;
    }

    const existingTimer = stickyTimers.get(channel.id);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(async () => {
        stickyTimers.delete(channel.id);

        for (const session of activeSessions.values()) {
            if (session.channel.id === channel.id) return;
        }

        const current = stickyMessages.get(channel.id);

        const lastMsg = await channel.messages.fetch({ limit: 1 }).then(m => m.first()).catch(() => null);
        if (lastMsg && current && lastMsg.id === current.messageId) return;

        if (current) {
            const messages = await channel.messages.fetch({ limit: 6 }).catch(() => null);
            const recentIds = messages ? messages.map(m => m.id) : [];

            if (recentIds.includes(current.messageId)) {
                const old = await channel.messages.fetch(current.messageId).catch(() => null);
                if (old) await old.delete().catch(() => { });
            }

            stickyMessages.delete(channel.id);
        }

        const newSticky = await channel.send(STICKY_CONTENT).catch(() => null);
        if (newSticky) {
            stickyMessages.set(channel.id, { messageId: newSticky.id });
        }
    }, STICKY_DELAY_MS);

    stickyTimers.set(channel.id, timer);
}

// ─── Staff embed senders ──────────────────────────────────────────────────────

async function sendGiveawayEmbed(client, channel, member, prizes, time, winners, message) {
    const guild = channel.guild;
    const hasCoins = hasCoinPrize(prizes);
    const prizeStr = buildPrizeString(prizes);

    const itemsNeedingManualNote = prizes.filter(p => !p.isCoins && !p.autoNoted);
    const hasUnnoted = itemsNeedingManualNote.length > 0;

    let noteInfo = '';
    if (hasCoins && hasUnnoted) noteInfo = '\n> ⚠️ Coins were auto-noted. Some items need manual note (not in price cache).';
    else if (hasUnnoted) noteInfo = '\n> ⚠️ Item donation — staff must set note manually (not in price cache).';

    const embed = new EmbedBuilder()
        .setTitle('<:prize:1000016483369369650> Giveaway Request')
        .setColor('#4c00b0')
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
            { name: '<:req:1000019378730975282> Donor', value: member.user.username, inline: true },
            { name: '<:prize:1000016483369369650> Prize', value: prizeStr, inline: false },
            { name: '<:time:1000024854478721125> Time', value: time, inline: true },
            { name: '<:winners:1000018706874781806> Winners', value: winners, inline: true },
            { name: '<:message:1000020218229305424> Message', value: message || 'None', inline: false },
        )
        .setFooter({ text: `ID: ${member.user.id}` })
        .setTimestamp();

    await channel.send({ content: `<@&${STAFF_ROLE_ID}>${noteInfo}`, embeds: [embed] });
}

async function sendHeistEmbed(client, channel, member, prizes, message) {
    const guild = channel.guild;
    const hasCoins = hasCoinPrize(prizes);
    const prizeStr = buildPrizeString(prizes);

    const itemsNeedingManualNote = prizes.filter(p => !p.isCoins && !p.autoNoted);
    const hasUnnoted = itemsNeedingManualNote.length > 0;

    let noteInfo = '';
    if (hasCoins && hasUnnoted) noteInfo = '\n> ⚠️ Coins were auto-noted. Some items need manual note (not in price cache).';
    else if (hasUnnoted) noteInfo = '\n> ⚠️ Item donation — staff must set note manually (not in price cache).';

    const embed = new EmbedBuilder()
        .setTitle('<:prize:1000016483369369650> Heist Request')
        .setColor('#4c00b0')
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
            { name: '<:req:1000019378730975282> Donor', value: member.user.username, inline: true },
            { name: '<:prize:1000016483369369650> Heist Amount', value: prizeStr, inline: false },
            { name: '<:message:1000020218229305424> Message', value: message || 'None', inline: false },
        )
        .setFooter({ text: `ID: ${member.user.id}` })
        .setTimestamp();

    await channel.send({ content: `<@&${STAFF_ROLE_ID}>${noteInfo}`, embeds: [embed] });
}

async function sendEventEmbed(client, channel, member, prizes, eventType, requirement, message) {
    const guild = channel.guild;
    const hasCoins = hasCoinPrize(prizes);
    const prizeStr = buildPrizeString(prizes);

    const itemsNeedingManualNote = prizes.filter(p => !p.isCoins && !p.autoNoted);
    const hasUnnoted = itemsNeedingManualNote.length > 0;

    let noteInfo = '';
    if (hasCoins && hasUnnoted) noteInfo = '\n> ⚠️ Coins were auto-noted. Some items need manual note (not in price cache).';
    else if (hasUnnoted) noteInfo = '\n> ⚠️ Item donation — staff must set note manually (item not found in database).';

    const embed = new EmbedBuilder()
        .setTitle('<:prize:1000016483369369650> Events Request')
        .setColor('#4c00b0')
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
            { name: '<:req:1000019378730975282> Donor', value: member.user.username, inline: true },
            { name: '<:prize:1000016483369369650> Amount', value: prizeStr, inline: false },
            { name: '<:time:1000024854478721125> Event Type', value: eventType, inline: true },
            { name: '<:winners:1000018706874781806> Requirement', value: requirement || 'None', inline: true },
            { name: '<:message:1000020218229305424> Message', value: message || 'None', inline: false },
        )
        .setFooter({ text: `ID: ${member.user.id}` })
        .setTimestamp();

    await channel.send({ content: `<@&${STAFF_ROLE_ID}>${noteInfo}`, embeds: [embed] });
}

// ─── Prompt helpers ───────────────────────────────────────────────────────────

async function askQuestion(session, promptContent, isOptional = false, timeoutMs = PROMPT_TIMEOUT_MS) {
    await safeDelete(session.promptMsg);

    const timeoutMinutes = Math.round(timeoutMs / 60000);
    const promptText = isOptional
        ? `${promptContent}\n> *Type your answer, or type \`skip\` / \`none\` to skip. You have ${timeoutMinutes} minutes.*`
        : `${promptContent}\n> *You have ${timeoutMinutes} minutes to reply.*`;

    session.promptMsg = await session.channel.send(`<@${session.userId}> ${promptText}`);

    return new Promise(resolve => {
        session.currentResolve = resolve;
        session.timer = setTimeout(async () => {
            session.currentResolve = null;
            await safeDelete(session.promptMsg);
            session.promptMsg = null;
            await session.channel.send(`<@${session.userId}> ⏰ You took too long to respond. Request cancelled.`);
            activeSessions.delete(session.userId);
            resolve(null);
        }, timeoutMs);
    });
}

async function askHeistOrEvent(session) {
    await safeDelete(session.promptMsg);

    const timeoutMinutes = Math.round(PROMPT_TIMEOUT_MS / 60000);
    session.promptMsg = await session.channel.send(
        `<@${session.userId}> Is this donation for a **Heist** or an **Event**?\n` +
        `> *Type \`heist\` or \`event\`. You have ${timeoutMinutes} minutes.*`
    );

    return new Promise(resolve => {
        session.currentResolve = resolve;
        session.timer = setTimeout(async () => {
            session.currentResolve = null;
            await safeDelete(session.promptMsg);
            session.promptMsg = null;
            await session.channel.send(`<@${session.userId}> ⏰ You took too long to respond. Request cancelled.`);
            activeSessions.delete(session.userId);
            resolve(null);
        }, PROMPT_TIMEOUT_MS);
    });
}

// ─── Merge-aware wrappers ─────────────────────────────────────────────────────

async function askWithMerge(session, promptContent, isOptional = false, timeoutMs = PROMPT_TIMEOUT_MS) {
    let answer;
    do {
        answer = await askQuestion(session, promptContent, isOptional, timeoutMs);
        if (answer === null) return null;
    } while (answer === '__reask__');
    return answer;
}

async function askHeistOrEventWithMerge(session) {
    while (true) {
        const answer = await askHeistOrEvent(session);
        if (answer === null) return null;
        if (answer === '__reask__') continue;

        const lower = answer.trim().toLowerCase();
        if (lower === 'heist' || lower === 'event') return lower;

        await safeDelete(session.promptMsg);
        session.promptMsg = null;
        const warn = await session.channel.send(
            `<@${session.userId}> ❌ Please type exactly \`heist\` or \`event\`.`
        );
        setTimeout(() => warn.delete().catch(() => { }), 5000);
    }
}

// ─── Flow runners ─────────────────────────────────────────────────────────────

async function runGiveawayFlowSafe(client, session) {
    const time = await askWithMerge(
        session,
        '**How long should the giveaway last?** (e.g. `1d`, `12h`, `30m`)'
    );
    if (time === null) return;

    const winners = await askWithMerge(session, '**How many winners?**');
    if (winners === null) return;

    const messageRaw = await askWithMerge(
        session,
        '**Any message for the giveaway?**',
        true,
        PROMPT_TIMEOUT_MESSAGE_MS
    );
    if (messageRaw === null) return;
    const message = /^(skip|none)$/i.test((messageRaw || '').trim()) ? null : messageRaw.trim();

    activeSessions.delete(session.userId);
    const member = await session.channel.guild.members.fetch(session.userId).catch(() => null);
    if (!member) return;

    await sendGiveawayEmbed(client, session.channel, member, session.prizes, time.trim(), winners.trim(), message);
}

async function runHeistFlowSafe(client, session) {
    const messageRaw = await askWithMerge(
        session,
        '**Any message for the heist?**',
        true,
        PROMPT_TIMEOUT_MESSAGE_MS
    );
    if (messageRaw === null) return;
    const message = /^(skip|none)$/i.test((messageRaw || '').trim()) ? null : messageRaw.trim();

    activeSessions.delete(session.userId);
    const member = await session.channel.guild.members.fetch(session.userId).catch(() => null);
    if (!member) return;

    await sendHeistEmbed(client, session.channel, member, session.prizes, message);
}

async function runEventFlowSafe(client, session) {
    const eventType = await askWithMerge(
        session,
        '**What type of event is this?**\n> *e.g. Mafia, Dice, Rumble, Mudae Tea, Dank Fight, Roulette — or any other event type.*'
    );
    if (eventType === null) return;

    const reqRaw = await askWithMerge(session, '**Any entry requirement?**', true);
    if (reqRaw === null) return;
    const requirement = /^(skip|none)$/i.test((reqRaw || '').trim()) ? null : reqRaw.trim();

    const messageRaw = await askWithMerge(
        session,
        '**Any additional message?**',
        true,
        PROMPT_TIMEOUT_MESSAGE_MS
    );
    if (messageRaw === null) return;
    const message = /^(skip|none)$/i.test((messageRaw || '').trim()) ? null : messageRaw.trim();

    activeSessions.delete(session.userId);
    const member = await session.channel.guild.members.fetch(session.userId).catch(() => null);
    if (!member) return;

    await sendEventEmbed(client, session.channel, member, session.prizes, eventType.trim(), requirement, message);
}

async function runEventChannelFlowSafe(client, session, skipHeistQuestion) {
    const hasAnyItem = session.prizes.some(p => !p.isCoins);
    const shouldSkip = skipHeistQuestion || hasAnyItem;

    const flowType = shouldSkip ? 'event' : await askHeistOrEventWithMerge(session);
    if (flowType === null) return;

    if (flowType === 'heist') {
        await runHeistFlowSafe(client, session);
    } else {
        await runEventFlowSafe(client, session);
    }
}

// ─── Main entry ───────────────────────────────────────────────────────────────
//
// itemQty      — number of items donated (default 1, ignored for coin donations)
// pricePerUnit — cached market avg price per item (null if not in cache)

async function handleDonationFlow(
    client, channelId, channel, userId,
    prizeText, isCoins, amount, autoNoted = false,
    itemQty = 1, pricePerUnit = null
) {
    const isGiveaway = channelId === GIVEAWAY_CHANNEL_ID;
    const isEvent = channelId === EVENT_CHANNEL_ID;
    if (!isGiveaway && !isEvent) return;

    const newPrize = { text: prizeText, isCoins, amount, autoNoted, itemQty, pricePerUnit };

    if (activeSessions.has(userId)) {
        const session = activeSessions.get(userId);
        clearTimeout(session.timer);
        session.timer = null;
        session.prizes.push(newPrize);

        if (session.currentResolve) {
            await safeDelete(session.promptMsg);
            session.promptMsg = null;

            const mergeMsg = await channel.send(
                `Another donation detected! Combining prizes. Re-asking the same question...`
            );
            setTimeout(() => mergeMsg.delete().catch(() => { }), 5000);

            const resolve = session.currentResolve;
            session.currentResolve = null;
            resolve('__reask__');
        }
        return;
    }

    const session = {
        userId,
        channel,
        prizes: [newPrize],
        promptMsg: null,
        timer: null,
        currentResolve: null,
    };
    activeSessions.set(userId, session);

    if (isGiveaway) {
        runGiveawayFlowSafe(client, session).catch(e => {
            console.error('[DonationFlow] Giveaway flow error:', e);
            activeSessions.delete(userId);
        });
    } else {
        const skipHeistQuestion = !isCoins;
        runEventChannelFlowSafe(client, session, skipHeistQuestion).catch(e => {
            console.error('[DonationFlow] Event flow error:', e);
            activeSessions.delete(userId);
        });
    }
}

// ─── Message collector ────────────────────────────────────────────────────────

function handleFlowMessage(message) {
    if (message.author.bot) return;
    const session = activeSessions.get(message.author.id);
    if (!session) return;
    if (message.channel.id !== session.channel.id) return;

    if (session.currentResolve) {
        clearTimeout(session.timer);
        session.timer = null;
        const resolve = session.currentResolve;
        session.currentResolve = null;
        const content = message.content;

        safeDelete(message);
        safeDelete(session.promptMsg).then(() => { session.promptMsg = null; });

        resolve(content);
    }
}

// ─── Button handler (kept for safety but no longer used in flow) ──────────────

async function handleFlowButton(interaction) {
    if (!interaction.isButton()) return false;
    if (!interaction.customId.startsWith('dflow_')) return false;
    await interaction.reply({ content: '❌ This button is no longer active. Please type your response in the channel.', ephemeral: true });
    return true;
}

module.exports = {
    handleDonationFlow,
    handleFlowMessage,
    handleFlowButton,
    handleStickyMessage,
    stripEmojiMarkup,
    GIVEAWAY_CHANNEL_ID,
    EVENT_CHANNEL_ID,
    DANK_MEMER_BOT_ID,
};