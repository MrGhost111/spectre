// Donations/donationFlow.js
// Handles the interactive post-donation Q&A flow for giveaway and event/heist channels.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const GIVEAWAY_CHANNEL_ID = '715528041673129984';
const EVENT_CHANNEL_ID    = '762204827131838515';
const STAFF_ROLE_ID       = '712970141834674207';
const DANK_MEMER_BOT_ID   = '270904126974590976';
const PROMPT_TIMEOUT_MS   = 30_000;

const STICKY_CONTENT = 'Want to sponsor a giveaway or event? Use </serverevents donate:1011560371267579936> to get started!';

// ─── Active sessions keyed by userId ─────────────────────────────────────────
const activeSessions = new Map();

// ─── Sticky message tracking: channelId → { messageId } ──────────────────────
const stickyMessages = new Map();

// ─── Sticky cooldown tracking: channelId → timestamp of last send ─────────────
const stickyCooldowns = new Map();
const STICKY_COOLDOWN_MS = 5_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPrizeString(prizes) {
    return prizes.map(p => p.text).join(' + ');
}

function hasCoinPrize(prizes) {
    return prizes.some(p => p.isCoins);
}

async function safeDelete(msg) {
    if (!msg) return;
    await msg.delete().catch(() => {});
}

/**
 * Strip Discord custom emoji markup from a string.
 * "<:AdventureTicket:934112100970807336>" becomes ""
 * Also handles animated emojis: "<a:name:id>"
 */
function stripEmojiMarkup(text) {
    return text.replace(/<a?:[^:>]+:\d+>/g, '').replace(/\s{2,}/g, ' ').trim();
}

// ─── Sticky message handler ───────────────────────────────────────────────────

/**
 * Call this from messageCreate for any message sent in a flow channel.
 * Skips if:
 *  - Message is from any bot (prevents the bot reacting to its own sticky)
 *  - Message IS the current sticky
 *  - A session is active in this channel
 *  - A sticky was sent within the last STICKY_COOLDOWN_MS milliseconds
 */
async function handleStickyMessage(channel, triggerMessage) {
    // Ignore ALL bot messages — this prevents the bot looping on its own sticky
    if (triggerMessage.author?.bot) return;

    const existing = stickyMessages.get(channel.id);
    if (existing && triggerMessage.id === existing.messageId) return;

    // Skip if a session is active in this channel
    for (const session of activeSessions.values()) {
        if (session.channel.id === channel.id) return;
    }

    // Enforce cooldown to prevent rapid re-sends
    const lastSent = stickyCooldowns.get(channel.id) ?? 0;
    const now = Date.now();
    if (now - lastSent < STICKY_COOLDOWN_MS) return;

    // Mark cooldown immediately before the async send to prevent race conditions
    stickyCooldowns.set(channel.id, now);

    if (existing) {
        const old = await channel.messages.fetch(existing.messageId).catch(() => null);
        if (old) await old.delete().catch(() => {});
    }

    const newSticky = await channel.send(STICKY_CONTENT).catch(() => null);
    if (newSticky) {
        stickyMessages.set(channel.id, { messageId: newSticky.id });
    }
}

// ─── Staff embed senders ──────────────────────────────────────────────────────

async function sendGiveawayEmbed(client, channel, member, prizes, time, winners, message) {
    const guild    = channel.guild;
    const hasCoins = hasCoinPrize(prizes);
    const hasItems = prizes.some(p => !p.isCoins);
    const prizeStr = buildPrizeString(prizes);

    let noteInfo = '';
    if (hasCoins && hasItems) noteInfo = '\n> ⚠️ Coins were auto-added to donations. Items need manual note.';
    else if (hasItems)        noteInfo = '\n> ⚠️ Item donation — staff must set note manually.';

    const embed = new EmbedBuilder()
        .setTitle('<:prize:1000016483369369650> Giveaway Request')
        .setColor('#4c00b0')
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
            { name: '<:req:1000019378730975282> Donor',       value: member.user.username, inline: true  },
            { name: '<:prize:1000016483369369650> Prize',     value: prizeStr,             inline: true  },
            { name: '<:time:1000024854478721125> Time',       value: time,                 inline: true  },
            { name: '<:winners:1000018706874781806> Winners', value: winners,              inline: true  },
            { name: '<:message:1000020218229305424> Message', value: message || 'None',    inline: false },
        )
        .setFooter({ text: `ID: ${member.user.id}` })
        .setTimestamp();

    await channel.send({ content: `<@&${STAFF_ROLE_ID}>${noteInfo}`, embeds: [embed] });
}

async function sendHeistEmbed(client, channel, member, prizes, message) {
    const guild    = channel.guild;
    const hasCoins = hasCoinPrize(prizes);
    const hasItems = prizes.some(p => !p.isCoins);
    const prizeStr = buildPrizeString(prizes);

    let noteInfo = '';
    if (hasCoins && hasItems) noteInfo = '\n> ⚠️ Coins were auto-added to donations. Items need manual note.';
    else if (hasItems)        noteInfo = '\n> ⚠️ Item donation — staff must set note manually.';

    const embed = new EmbedBuilder()
        .setTitle('<:prize:1000016483369369650> Heist Request')
        .setColor('#4c00b0')
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
            { name: '<:req:1000019378730975282> Donor',          value: member.user.username, inline: true  },
            { name: '<:prize:1000016483369369650> Heist Amount', value: prizeStr,             inline: true  },
            { name: '<:message:1000020218229305424> Message',    value: message || 'None',    inline: false },
        )
        .setFooter({ text: `ID: ${member.user.id}` })
        .setTimestamp();

    await channel.send({ content: `<@&${STAFF_ROLE_ID}>${noteInfo}`, embeds: [embed] });
}

async function sendEventEmbed(client, channel, member, prizes, eventType, requirement, message) {
    const guild    = channel.guild;
    const hasCoins = hasCoinPrize(prizes);
    const hasItems = prizes.some(p => !p.isCoins);
    const prizeStr = buildPrizeString(prizes);

    let noteInfo = '';
    if (hasCoins && hasItems) noteInfo = '\n> ⚠️ Coins were auto-added to donations. Items need manual note.';
    else if (hasItems)        noteInfo = '\n> ⚠️ Item donation — staff must set note manually.';

    const embed = new EmbedBuilder()
        .setTitle('<:prize:1000016483369369650> Events Request')
        .setColor('#4c00b0')
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
            { name: '<:req:1000019378730975282> Donor',           value: member.user.username,  inline: true  },
            { name: '<:prize:1000016483369369650> Amount',        value: prizeStr,              inline: true  },
            { name: '<:time:1000024854478721125> Event Type',     value: eventType,             inline: true  },
            { name: '<:winners:1000018706874781806> Requirement', value: requirement || 'None', inline: true  },
            { name: '<:message:1000020218229305424> Message',     value: message || 'None',     inline: false },
        )
        .setFooter({ text: `ID: ${member.user.id}` })
        .setTimestamp();

    await channel.send({ content: `<@&${STAFF_ROLE_ID}>${noteInfo}`, embeds: [embed] });
}

// ─── Prompt helpers ───────────────────────────────────────────────────────────

async function askQuestion(session, promptContent, isOptional = false) {
    await safeDelete(session.promptMsg);

    const promptText = isOptional
        ? `${promptContent}\n> *Type your answer, or type \`skip\` / \`none\` to skip.*`
        : promptContent;

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
        }, PROMPT_TIMEOUT_MS);
    });
}

async function askHeistOrEvent(session) {
    await safeDelete(session.promptMsg);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`dflow_heist_${session.userId}`)
            .setLabel('Heist')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`dflow_event_${session.userId}`)
            .setLabel('Event')
            .setStyle(ButtonStyle.Secondary),
    );

    session.promptMsg = await session.channel.send({
        content:    `<@${session.userId}> Is this donation for a **Heist** or an **Event**?`,
        components: [row],
    });

    return new Promise(resolve => {
        session.currentResolve = resolve;
        session.awaitingButton = true;
        session.timer = setTimeout(async () => {
            session.currentResolve = null;
            session.awaitingButton = false;
            await safeDelete(session.promptMsg);
            session.promptMsg = null;
            await session.channel.send(`<@${session.userId}> ⏰ You took too long to respond. Request cancelled.`);
            activeSessions.delete(session.userId);
            resolve(null);
        }, PROMPT_TIMEOUT_MS);
    });
}

// ─── Merge-aware wrappers ─────────────────────────────────────────────────────

async function askWithMerge(session, promptContent, isOptional = false) {
    let answer;
    do {
        answer = await askQuestion(session, promptContent, isOptional);
        if (answer === null) return null;
    } while (answer === '__reask__');
    return answer;
}

async function askHeistOrEventWithMerge(session) {
    let answer;
    do {
        answer = await askHeistOrEvent(session);
        if (answer === null) return null;
    } while (answer === '__reask__');
    return answer;
}

// ─── Flow runners ─────────────────────────────────────────────────────────────

async function runGiveawayFlowSafe(client, session) {
    const time = await askWithMerge(session, '**How long should the giveaway last?** (e.g. `1d`, `12h`, `30m`)');
    if (time === null) return;

    const winners = await askWithMerge(session, '**How many winners?**');
    if (winners === null) return;

    const messageRaw = await askWithMerge(session, '**Any message for the giveaway?**', true);
    if (messageRaw === null) return;
    const message = /^(skip|none)$/i.test((messageRaw || '').trim()) ? null : messageRaw.trim();

    activeSessions.delete(session.userId);
    const member = await session.channel.guild.members.fetch(session.userId).catch(() => null);
    if (!member) return;

    await sendGiveawayEmbed(client, session.channel, member, session.prizes, time.trim(), winners.trim(), message);
}

async function runHeistFlowSafe(client, session) {
    const messageRaw = await askWithMerge(session, '**Any message for the heist?**', true);
    if (messageRaw === null) return;
    const message = /^(skip|none)$/i.test((messageRaw || '').trim()) ? null : messageRaw.trim();

    activeSessions.delete(session.userId);
    const member = await session.channel.guild.members.fetch(session.userId).catch(() => null);
    if (!member) return;

    await sendHeistEmbed(client, session.channel, member, session.prizes, message);
}

async function runEventFlowSafe(client, session) {
    const eventType = await askWithMerge(session, '**What type of event is this?** (e.g. `Trivia`, `Dank`, `Math`)');
    if (eventType === null) return;

    const reqRaw = await askWithMerge(session, '**Any entry requirement?**', true);
    if (reqRaw === null) return;
    const requirement = /^(skip|none)$/i.test((reqRaw || '').trim()) ? null : reqRaw.trim();

    const messageRaw = await askWithMerge(session, '**Any additional message?**', true);
    if (messageRaw === null) return;
    const message = /^(skip|none)$/i.test((messageRaw || '').trim()) ? null : messageRaw.trim();

    activeSessions.delete(session.userId);
    const member = await session.channel.guild.members.fetch(session.userId).catch(() => null);
    if (!member) return;

    await sendEventEmbed(client, session.channel, member, session.prizes, eventType.trim(), requirement, message);
}

async function runEventChannelFlowSafe(client, session, skipHeistQuestion) {
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
    const isEvent    = channelId === EVENT_CHANNEL_ID;
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
            setTimeout(() => mergeMsg.delete().catch(() => {}), 5000);

            const resolve = session.currentResolve;
            session.currentResolve = null;
            resolve('__reask__');
        }
        return;
    }

    const session = {
        userId,
        channel,
        prizes:         [newPrize],
        promptMsg:      null,
        timer:          null,
        currentResolve: null,
        awaitingButton: false,
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
    if (session.awaitingButton) return;

    if (session.currentResolve) {
        clearTimeout(session.timer);
        session.timer = null;
        const resolve = session.currentResolve;
        session.currentResolve = null;
        const content = message.content;

        // Delete user's message to keep the channel clean
        safeDelete(message);
        safeDelete(session.promptMsg).then(() => { session.promptMsg = null; });

        resolve(content);
    }
}

// ─── Button handler ───────────────────────────────────────────────────────────

async function handleFlowButton(interaction) {
    if (!interaction.isButton()) return false;
    const { customId } = interaction;
    if (!customId.startsWith('dflow_')) return false;

    const parts   = customId.split('_');
    const action  = parts[1];
    const userId  = parts[2];
    const session = activeSessions.get(userId);

    if (interaction.user.id !== userId) {
        await interaction.reply({ content: '❌ This is not your donation flow!', ephemeral: true });
        return true;
    }

    if (!session || !session.awaitingButton || !session.currentResolve) {
        await interaction.reply({ content: '❌ No active flow found.', ephemeral: true });
        return true;
    }

    clearTimeout(session.timer);
    session.timer          = null;
    session.awaitingButton = false;

    const resolve = session.currentResolve;
    session.currentResolve = null;

    await interaction.update({ components: [] }).catch(() => {});
    safeDelete(session.promptMsg).then(() => { session.promptMsg = null; });

    resolve(action);
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
