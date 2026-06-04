// Donations/donationFlow.js

const { EmbedBuilder } = require('discord.js');

const GIVEAWAY_CHANNEL_ID = '715528041673129984';
const EVENT_CHANNEL_ID = '762204827131838515';
const SERVER_DONATION_CHANNEL_ID = '1289101664426397717';
const STAFF_ROLE_ID = '712970141834674207';
const DANK_MEMER_BOT_ID = '270904126974590976';

const PROMPT_TIMEOUT_MS = 5 * 60 * 1000;
const PROMPT_TIMEOUT_MESSAGE_MS = 10 * 60 * 1000;
const STICKY_DELAY_MS = 30_000;

// ─── Minimum donation thresholds ──────────────────────────────────────────────
const MIN_GIVEAWAY_AMOUNT = 10_000_000;   // 10 million
const MIN_MASSIVE_GIVEAWAY_AMOUNT = 30_000_000; // 30 million (info-only, not a hard gate)
const MIN_EVENT_AMOUNT = 3_000_000;       // 3 million

// ─── Staff ping cooldown (per channel, in ms) ─────────────────────────────────
const STAFF_PING_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
// Map: channelId → timestamp of last staff ping
const staffPingCooldowns = new Map();

const STICKY_CONTENT = {
    [GIVEAWAY_CHANNEL_ID]: {
        title: '<:prize:1000016483369369650> Want to sponsor a giveaway?',
        description: 'Make a donation using </serverevents donate:1011560371267579936> and the bot will walk you through the rest — duration, winners, and a custom message.\n\nNo need to ping staff, it\'s all automated!',
        color: '#4c00b0',
    },
    [EVENT_CHANNEL_ID]: {
        title: '<:prize:1000016483369369650> Want to sponsor an event or heist?',
        description: 'Make a donation using </serverevents donate:1011560371267579936> and the bot will ask you whether it\'s for a **heist** or an **event**, then handle the rest.\n\nNo need to ping staff, it\'s all automated!',
        color: '#4c00b0',
    },
    [SERVER_DONATION_CHANNEL_ID]: {
        title: '<:prize:1000016483369369650> Want to donate to the server?',
        description: 'Make a donation using </serverevents donate:1011560371267579936> — no giveaway or event needed. Just donate and staff will put it to good use!\n\nNo need to ping staff, it\'s all automated!',
        color: '#4c00b0',
    },
};

const activeSessions = new Map();
const stickyMessages = new Map();  // channelId → messageId
const stickyTimers = new Map();    // channelId → timeout

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPrizeString(prizes) {
    const coinPrizes = prizes.filter(p => p.isCoins);
    const itemPrizes = prizes.filter(p => !p.isCoins);
    const groups = [];

    if (coinPrizes.length === 1) {
        groups.push(`⏣ ${(coinPrizes[0].amount || 0).toLocaleString()}`);
    } else if (coinPrizes.length > 1) {
        const total = coinPrizes.reduce((sum, p) => sum + (p.amount || 0), 0);
        const parts = coinPrizes.map(p => `⏣ ${(p.amount || 0).toLocaleString()}`).join(' + ');
        groups.push(`⏣ ${total.toLocaleString()} (${parts})`);
    }

    const itemMap = new Map();
    for (const p of itemPrizes) {
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
        let line = `**${entry.totalQty} × ${name}**`;
        if (entry.totalValue > 0) {
            line += `\n⏣ ${entry.totalValue.toLocaleString()} total`;
            if (entry.pricePerUnit && entry.totalQty > 1) {
                line += ` (⏣ ${entry.pricePerUnit.toLocaleString()} each)`;
            }
        }
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

function getTotalAmount(prizes) {
    return prizes.reduce((sum, p) => sum + (p.amount || 0), 0);
}

async function safeDelete(msg) {
    if (!msg) return;
    await msg.delete().catch(() => { });
}

function stripEmojiMarkup(text) {
    return text.replace(/<a?:[^:>]+:\d+>/g, '').replace(/\s{2,}/g, ' ').trim();
}

// ─── Staff ping cooldown helpers ──────────────────────────────────────────────

/**
 * Returns how many ms remain on the cooldown for the given channel,
 * or 0 if the cooldown has expired / never been set.
 */
function getStaffPingCooldownRemaining(channelId) {
    const last = staffPingCooldowns.get(channelId);
    if (!last) return 0;
    const elapsed = Date.now() - last;
    return elapsed >= STAFF_PING_COOLDOWN_MS ? 0 : STAFF_PING_COOLDOWN_MS - elapsed;
}

function setStaffPingCooldown(channelId) {
    staffPingCooldowns.set(channelId, Date.now());
}

/**
 * Sends the staff ping (role mention) for a channel.
 * If the channel is on cooldown, schedules the ping for when the CD expires.
 * Returns immediately either way.
 */
async function sendStaffPing(channel, content) {
    const remaining = getStaffPingCooldownRemaining(channel.id);

    if (remaining <= 0) {
        setStaffPingCooldown(channel.id);
        await channel.send(content).catch(() => { });
    } else {
        setTimeout(async () => {
            setStaffPingCooldown(channel.id);
            await channel.send(content).catch(() => { });
        }, remaining);
    }
}

// ─── Sticky message handler ───────────────────────────────────────────────────

async function handleStickyMessage(channel, triggerMessage) {
    if (triggerMessage.author?.id === DANK_MEMER_BOT_ID) return;
    if (!STICKY_CONTENT[channel.id]) return;

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

        const lastMsg = await channel.messages.fetch({ limit: 1 })
            .then(m => m.first())
            .catch(() => null);

        const currentStickyId = stickyMessages.get(channel.id);
        if (lastMsg && currentStickyId && lastMsg.id === currentStickyId) return;

        if (currentStickyId) {
            const old = await channel.messages.fetch(currentStickyId).catch(() => null);
            if (old) await old.delete().catch(() => { });
            stickyMessages.delete(channel.id);
        }

        const config = STICKY_CONTENT[channel.id];
        const embed = new EmbedBuilder()
            .setTitle(config.title)
            .setDescription(config.description)
            .setColor(config.color)
            .setFooter({ text: 'Powered by /serverevents donate' });

        const newSticky = await channel.send({ embeds: [embed] }).catch(() => null);
        if (newSticky) {
            stickyMessages.set(channel.id, newSticky.id);
        }
    }, STICKY_DELAY_MS);

    stickyTimers.set(channel.id, timer);
}

// ─── Staff embed senders ──────────────────────────────────────────────────────

async function sendGiveawayEmbed(client, channel, member, prizes, time, winners, message, pingStaff) {
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

    // Always send the embed immediately
    await channel.send({ embeds: [embed] });

    // Only ping staff if user opted in
    if (pingStaff) {
        const pingContent = `<@&${STAFF_ROLE_ID}>${noteInfo}`;
        await sendStaffPing(channel, pingContent);
    }
}

async function sendHeistEmbed(client, channel, member, prizes, message, pingStaff) {
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

    await channel.send({ embeds: [embed] });

    if (pingStaff) {
        const pingContent = `<@&${STAFF_ROLE_ID}>${noteInfo}`;
        await sendStaffPing(channel, pingContent);
    }
}

async function sendEventEmbed(client, channel, member, prizes, eventType, requirement, message, pingStaff) {
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

    await channel.send({ embeds: [embed] });

    if (pingStaff) {
        const pingContent = `<@&${STAFF_ROLE_ID}>${noteInfo}`;
        await sendStaffPing(channel, pingContent);
    }
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

/**
 * Asks the user if they want to ping staff.
 * Returns true if yes (y/yes), false for anything else.
 */
async function askPingStaff(session) {
    const cooldownRemaining = getStaffPingCooldownRemaining(session.channel.id);

    let promptText = '**Do you want to ping staff?**\n> *Reply `yes` to ping staff, or anything else to skip.*';
    if (cooldownRemaining > 0) {
        const secondsLeft = Math.ceil(cooldownRemaining / 1000);
        const minutesLeft = Math.ceil(secondsLeft / 60);
        promptText =
            `**Do you want to ping staff?**\n` +
            `> ⏳ Staff was recently pinged in this channel. If you choose yes, the ping will be sent automatically in **~${minutesLeft} minute(s)**.\n` +
            `> *Reply \`yes\` to schedule the ping, or anything else to skip.*`;
    }

    const raw = await askWithMerge(session, promptText, false);
    if (raw === null) return null;
    return /^(y|yes)$/i.test(raw.trim());
}

// ─── Flow runners ─────────────────────────────────────────────────────────────

async function runGiveawayFlowSafe(client, session) {
    const time = await askWithMerge(session, '**How long should the giveaway last?** (e.g. `1d`, `12h`, `30m`)');
    if (time === null) return;

    const winners = await askWithMerge(session, '**How many winners?**');
    if (winners === null) return;

    const messageRaw = await askWithMerge(session, '**Any message for the giveaway?**', true, PROMPT_TIMEOUT_MESSAGE_MS);
    if (messageRaw === null) return;
    const message = /^(skip|none)$/i.test((messageRaw || '').trim()) ? null : messageRaw.trim();

    const pingStaff = await askPingStaff(session);
    if (pingStaff === null) return;

    activeSessions.delete(session.userId);
    const member = await session.channel.guild.members.fetch(session.userId).catch(() => null);
    if (!member) return;

    await sendGiveawayEmbed(client, session.channel, member, session.prizes, time.trim(), winners.trim(), message, pingStaff);
}

async function runHeistFlowSafe(client, session) {
    const messageRaw = await askWithMerge(session, '**Any message for the heist?**', true, PROMPT_TIMEOUT_MESSAGE_MS);
    if (messageRaw === null) return;
    const message = /^(skip|none)$/i.test((messageRaw || '').trim()) ? null : messageRaw.trim();

    const pingStaff = await askPingStaff(session);
    if (pingStaff === null) return;

    activeSessions.delete(session.userId);
    const member = await session.channel.guild.members.fetch(session.userId).catch(() => null);
    if (!member) return;

    await sendHeistEmbed(client, session.channel, member, session.prizes, message, pingStaff);
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

    const messageRaw = await askWithMerge(session, '**Any additional message?**', true, PROMPT_TIMEOUT_MESSAGE_MS);
    if (messageRaw === null) return;
    const message = /^(skip|none)$/i.test((messageRaw || '').trim()) ? null : messageRaw.trim();

    const pingStaff = await askPingStaff(session);
    if (pingStaff === null) return;

    activeSessions.delete(session.userId);
    const member = await session.channel.guild.members.fetch(session.userId).catch(() => null);
    if (!member) return;

    await sendEventEmbed(client, session.channel, member, session.prizes, eventType.trim(), requirement, message, pingStaff);
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

async function handleDonationFlow(
    client, channelId, channel, userId,
    prizeText, isCoins, amount, autoNoted = false,
    itemQty = 1, pricePerUnit = null
) {
    const isGiveaway = channelId === GIVEAWAY_CHANNEL_ID;
    const isEvent = channelId === EVENT_CHANNEL_ID;
    if (!isGiveaway && !isEvent) return;

    // ── Minimum threshold check (only applies to fresh sessions, not merges) ──
    if (!activeSessions.has(userId)) {
        if (isGiveaway && amount < MIN_GIVEAWAY_AMOUNT) {
            await channel.send(
                `<@${userId}> ❌ The minimum donation to sponsor a giveaway is **⏣ ${MIN_GIVEAWAY_AMOUNT.toLocaleString()}**.\n` +
                `> 💜 Want to go big? Donations of **⏣ ${MIN_MASSIVE_GIVEAWAY_AMOUNT.toLocaleString()}+** qualify as a **massive giveaway**!`
            );
            return;
        }

        if (isEvent && amount < MIN_EVENT_AMOUNT) {
            await channel.send(
                `<@${userId}> ❌ The minimum donation to sponsor an event is **⏣ ${MIN_EVENT_AMOUNT.toLocaleString()}**.`
            );
            return;
        }
    }

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

// ─── Button handler ───────────────────────────────────────────────────────────

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
    SERVER_DONATION_CHANNEL_ID,
    DANK_MEMER_BOT_ID,
};