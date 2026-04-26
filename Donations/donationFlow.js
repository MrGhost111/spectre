// Donations/donationFlow.js
// Handles the interactive post-donation Q&A flow for giveaway and event/heist channels.
//
// Changes from previous version:
//  - Heist-or-Event question now uses plain text instead of buttons (buttons were broken)
//  - All question timeouts extended to 5 minutes (300s), final message question 10 minutes (600s)
//  - Event type is open free-text input (Mafia, Dice, Rumble, Mudae Tea, etc.)
//  - No ActionRowBuilder / ButtonBuilder used anywhere in the flow

const { EmbedBuilder } = require('discord.js');

const GIVEAWAY_CHANNEL_ID = '715528041673129984';
const EVENT_CHANNEL_ID = '762204827131838515';
const STAFF_ROLE_ID = '712970141834674207';
const DANK_MEMER_BOT_ID = '270904126974590976';

// Timeouts
const PROMPT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes  — all questions
const PROMPT_TIMEOUT_MESSAGE_MS = 10 * 60 * 1000; // 10 minutes — optional message question

const STICKY_CONTENT = 'Want to sponsor a giveaway or event? Use </serverevents donate:1011560371267579936> to get started!';

// ─── Active sessions keyed by userId ─────────────────────────────────────────
const activeSessions = new Map();

// ─── Sticky message tracking: channelId → { messageId } ──────────────────────
const stickyMessages = new Map();

// ─── Sticky debounce timers: channelId → setTimeout handle ───────────────────
// Instead of sending a sticky on every message (causes 2-4 rapid stickies),
// we wait 30 seconds of channel inactivity before posting. Each new message
// resets the timer. Only one timer runs per channel at a time.
const stickyTimers = new Map();
const STICKY_DELAY_MS = 30_000; // 30 seconds of inactivity

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPrizeString(prizes) {
    return prizes.map(p => p.text).join(' + ');
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
 * Also handles animated emojis: "<a:name:id>"
 */
function stripEmojiMarkup(text) {
    return text.replace(/<a?:[^:>]+:\d+>/g, '').replace(/\s{2,}/g, ' ').trim();
}

// ─── Sticky message handler ───────────────────────────────────────────────────
//
// Debounced: resets a 30-second timer on every message. The sticky is only
// posted after 30 seconds of silence in the channel. This prevents the
// rapid-fire multi-sticky bug caused by several messages arriving at once.

function handleStickyMessage(channel, triggerMessage) {
    // Ignore Dank Memer messages — they shouldn't reset the timer or post stickies
    if (triggerMessage.author?.id === DANK_MEMER_BOT_ID) return;

    // If the trigger IS the current sticky message, ignore it
    const existing = stickyMessages.get(channel.id);
    if (existing && triggerMessage.id === existing.messageId) return;

    // If a flow session is active in this channel, don't post a sticky at all
    for (const session of activeSessions.values()) {
        if (session.channel.id === channel.id) return;
    }

    // Clear any pending timer — we're resetting the 30s countdown
    const existingTimer = stickyTimers.get(channel.id);
    if (existingTimer) clearTimeout(existingTimer);

    // Schedule the sticky post after 30 seconds of inactivity
    const timer = setTimeout(async () => {
        stickyTimers.delete(channel.id);

        // Re-check: if a session started while we were waiting, skip
        for (const session of activeSessions.values()) {
            if (session.channel.id === channel.id) return;
        }

        // Delete the old sticky if it exists
        const current = stickyMessages.get(channel.id);
        if (current) {
            const old = await channel.messages.fetch(current.messageId).catch(() => null);
            if (old) await old.delete().catch(() => { });
            stickyMessages.delete(channel.id);
        }

        // Post the new sticky
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
    const hasItems = prizes.some(p => !p.isCoins);
    const prizeStr = buildPrizeString(prizes);

    let noteInfo = '';
    if (hasCoins && hasItems) noteInfo = '\n> ⚠️ Coins were auto-added to donations. Items need manual note.';
    else if (hasItems) noteInfo = '\n> ⚠️ Item donation — staff must set note manually.';

    const embed = new EmbedBuilder()
        .setTitle('<:prize:1000016483369369650> Giveaway Request')
        .setColor('#4c00b0')
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
            { name: '<:req:1000019378730975282> Donor', value: member.user.username, inline: true },
            { name: '<:prize:1000016483369369650> Prize', value: prizeStr, inline: true },
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
    const hasItems = prizes.some(p => !p.isCoins);
    const prizeStr = buildPrizeString(prizes);

    let noteInfo = '';
    if (hasCoins && hasItems) noteInfo = '\n> ⚠️ Coins were auto-added to donations. Items need manual note.';
    else if (hasItems) noteInfo = '\n> ⚠️ Item donation — staff must set note manually.';

    const embed = new EmbedBuilder()
        .setTitle('<:prize:1000016483369369650> Heist Request')
        .setColor('#4c00b0')
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
            { name: '<:req:1000019378730975282> Donor', value: member.user.username, inline: true },
            { name: '<:prize:1000016483369369650> Heist Amount', value: prizeStr, inline: true },
            { name: '<:message:1000020218229305424> Message', value: message || 'None', inline: false },
        )
        .setFooter({ text: `ID: ${member.user.id}` })
        .setTimestamp();

    await channel.send({ content: `<@&${STAFF_ROLE_ID}>${noteInfo}`, embeds: [embed] });
}

async function sendEventEmbed(client, channel, member, prizes, eventType, requirement, message) {
    const guild = channel.guild;
    const hasCoins = hasCoinPrize(prizes);
    const hasItems = prizes.some(p => !p.isCoins);
    const prizeStr = buildPrizeString(prizes);

    let noteInfo = '';
    if (hasCoins && hasItems) noteInfo = '\n> ⚠️ Coins were auto-added to donations. Items need manual note.';
    else if (hasItems) noteInfo = '\n> ⚠️ Item donation — staff must set note manually.';

    const embed = new EmbedBuilder()
        .setTitle('<:prize:1000016483369369650> Events Request')
        .setColor('#4c00b0')
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
            { name: '<:req:1000019378730975282> Donor', value: member.user.username, inline: true },
            { name: '<:prize:1000016483369369650> Amount', value: prizeStr, inline: true },
            { name: '<:time:1000024854478721125> Event Type', value: eventType, inline: true },
            { name: '<:winners:1000018706874781806> Requirement', value: requirement || 'None', inline: true },
            { name: '<:message:1000020218229305424> Message', value: message || 'None', inline: false },
        )
        .setFooter({ text: `ID: ${member.user.id}` })
        .setTimestamp();

    await channel.send({ content: `<@&${STAFF_ROLE_ID}>${noteInfo}`, embeds: [embed] });
}

// ─── Prompt helpers ───────────────────────────────────────────────────────────

/**
 * Ask a single question and wait for the user's text reply.
 * @param {object}  session
 * @param {string}  promptContent
 * @param {boolean} isOptional     - If true, adds "or type skip/none" hint
 * @param {number}  timeoutMs      - How long to wait before cancelling
 */
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

/**
 * Ask whether this is a Heist or Event using plain text.
 * User types "heist" or "event" (case-insensitive). Anything else re-asks.
 */
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
// When a second donation arrives mid-flow, we resolve the current promise with
// '__reask__' so the loop here retries the same question automatically.

async function askWithMerge(session, promptContent, isOptional = false, timeoutMs = PROMPT_TIMEOUT_MS) {
    let answer;
    do {
        answer = await askQuestion(session, promptContent, isOptional, timeoutMs);
        if (answer === null) return null;
    } while (answer === '__reask__');
    return answer;
}

async function askHeistOrEventWithMerge(session) {
    // Keep re-asking until we get a valid "heist" or "event" answer, or timeout
    while (true) {
        const answer = await askHeistOrEvent(session);
        if (answer === null) return null;           // timed out
        if (answer === '__reask__') continue;       // mid-flow donation merge

        const lower = answer.trim().toLowerCase();
        if (lower === 'heist' || lower === 'event') return lower;

        // Invalid input — tell them and loop
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
        PROMPT_TIMEOUT_MESSAGE_MS  // 10 minutes for optional message
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
        PROMPT_TIMEOUT_MESSAGE_MS  // 10 minutes
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

    const reqRaw = await askWithMerge(
        session,
        '**Any entry requirement?**',
        true
    );
    if (reqRaw === null) return;
    const requirement = /^(skip|none)$/i.test((reqRaw || '').trim()) ? null : reqRaw.trim();

    const messageRaw = await askWithMerge(
        session,
        '**Any additional message?**',
        true,
        PROMPT_TIMEOUT_MESSAGE_MS  // 10 minutes
    );
    if (messageRaw === null) return;
    const message = /^(skip|none)$/i.test((messageRaw || '').trim()) ? null : messageRaw.trim();

    activeSessions.delete(session.userId);
    const member = await session.channel.guild.members.fetch(session.userId).catch(() => null);
    if (!member) return;

    await sendEventEmbed(client, session.channel, member, session.prizes, eventType.trim(), requirement, message);
}

async function runEventChannelFlowSafe(client, session, skipHeistQuestion) {
    // skipHeistQuestion is true when the donation was an item (items → always event flow)
    const flowType = skipHeistQuestion ? 'event' : await askHeistOrEventWithMerge(session);
    if (flowType === null) return;

    if (flowType === 'heist') {
        await runHeistFlowSafe(client, session);
    } else {
        await runEventFlowSafe(client, session);
    }
}

// ─── Main entry ───────────────────────────────────────────────────────────────

async function handleDonationFlow(client, channelId, channel, userId, prizeText, isCoins, coinAmount) {
    const isGiveaway = channelId === GIVEAWAY_CHANNEL_ID;
    const isEvent = channelId === EVENT_CHANNEL_ID;
    if (!isGiveaway && !isEvent) return;

    const newPrize = { text: prizeText, isCoins, amount: coinAmount };

    if (activeSessions.has(userId)) {
        const session = activeSessions.get(userId);
        clearTimeout(session.timer);
        session.timer = null;
        session.prizes.push(newPrize);

        if (session.currentResolve) {
            await safeDelete(session.promptMsg);
            session.promptMsg = null;

            const mergeMsg = await channel.send(
                `<@${userId}> Another donation detected! Combining prizes. Re-asking the same question...`
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
        // For item donations in the event channel we skip "heist or event?" and
        // go straight to event flow (heists are always coins)
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
    // Buttons are no longer used — just dismiss gracefully
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