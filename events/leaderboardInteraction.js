// events/leaderboardInteraction.js
const { MessageFlags } = require('discord.js');
const { buildLeaderboard, buildSelectMenu, buildButtons, getSorted } =
    require('../commands/leaderboard')._helpers;

const PAGE_SIZE = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveNewPage(id, currentPage, totalPages, userPage) {
    if (id.startsWith('lb_first_')) return 0;
    if (id.startsWith('lb_prev_')) return Math.max(0, currentPage - 1);
    if (id.startsWith('lb_next_')) return Math.min(totalPages - 1, currentPage + 1);
    if (id.startsWith('lb_last_')) return totalPages - 1;
    if (id.startsWith('lb_myrank_')) return userPage;
    return currentPage;
}

function buildState(event, userId) {
    const sorted = getSorted(event);
    const totalPages = Math.ceil(sorted.length / PAGE_SIZE) || 1;
    const idx = sorted.findIndex(e => e.userId === userId);
    const userPage = idx === -1 ? -1 : Math.floor(idx / PAGE_SIZE);
    return { sorted, totalPages, userPage, event };
}

async function buildComponents(state, page, interaction) {
    const embed = await buildLeaderboard(state.sorted, page, state.totalPages, interaction, state.event);
    const selectRow = buildSelectMenu(state.event);
    const buttonRow = buildButtons(page, state.totalPages, state.userPage);
    return { embed, selectRow, buttonRow };
}

// ── Module ────────────────────────────────────────────────────────────────────

module.exports = {
    name: 'interactionCreate',
    once: false,

    async execute(client, interaction) {
        // Gate: only handle our lb_ components
        const isSelect = interaction.isStringSelectMenu?.() ?? interaction.isSelectMenu?.();
        const isBtn = interaction.isButton?.();
        if (!isSelect && !isBtn) return;

        const customId = interaction.customId ?? '';
        if (isBtn && !customId.startsWith('lb_')) return;
        if (isSelect && customId !== 'lb_event_select') return;

        if (!client._lbCache) client._lbCache = new Map();
        if (!client._lbUserCache) client._lbUserCache = new Map();

        const msgId = interaction.message?.id;
        const userId = interaction.user.id;

        // The message-level cache entry for whatever message this interaction came from
        const msgCache = client._lbCache.get(msgId);

        // ── CASE 1: The original slash-command author is interacting ──────────
        // We identify them by the msgCache on the PUBLIC (non-ephemeral) message.
        // For the author we always update() in-place — never a new reply.
        if (msgCache?.interactionUserId === userId && !msgCache?.ephemeral) {
            let { sorted, totalPages, userPage, event, page = 0 } = msgCache;

            if (isSelect) {
                event = interaction.values[0];
                ({ sorted, totalPages, userPage } = buildState(event, userId));
                page = 0;
            } else {
                page = resolveNewPage(customId, page, totalPages, userPage);
            }

            Object.assign(msgCache, { sorted, totalPages, userPage, event, page });

            const { embed, selectRow, buttonRow } = await buildComponents(
                { sorted, totalPages, userPage, event }, page, interaction
            );
            return interaction.update({ embeds: [embed], components: [selectRow, buttonRow] });
        }

        // ── CASE 2: A different user interacts — manage their own ephemeral ──
        // Sub-case A: We already have a msgCache entry for an ephemeral this user owns.
        if (msgCache?.interactionUserId === userId && msgCache?.ephemeral) {
            let { sorted, totalPages, userPage, event, page = 0 } = msgCache;

            if (isSelect) {
                event = interaction.values[0];
                ({ sorted, totalPages, userPage } = buildState(event, userId));
                page = 0;
            } else {
                page = resolveNewPage(customId, page, totalPages, userPage);
            }

            Object.assign(msgCache, { sorted, totalPages, userPage, event, page });

            const { embed, selectRow, buttonRow } = await buildComponents(
                { sorted, totalPages, userPage, event }, page, interaction
            );
            // update() edits their own ephemeral in-place
            return interaction.update({ embeds: [embed], components: [selectRow, buttonRow] });
        }

        // Sub-case B: User has a pending userCache entry (ephemeral was sent but
        // msgId wasn't captured yet, or they're clicking a different message).
        const userState = client._lbUserCache.get(userId);

        if (userState) {
            let { sorted, totalPages, userPage, event, page = 0 } = userState;

            if (isSelect) {
                event = interaction.values[0];
                ({ sorted, totalPages, userPage } = buildState(event, userId));
                page = 0;
            } else {
                page = resolveNewPage(customId, page, totalPages, userPage);
            }

            const { embed, selectRow, buttonRow } = await buildComponents(
                { sorted, totalPages, userPage, event }, page, interaction
            );

            // Is this interaction coming from a message we don't own (different author's public msg)?
            const interactionIsOnForeignMessage = msgCache && msgCache.interactionUserId !== userId;

            if (interactionIsOnForeignMessage) {
                // Must send a new reply — we can't update() a message we don't own
                const response = await interaction.reply({
                    embeds: [embed],
                    components: [selectRow, buttonRow],
                    flags: MessageFlags.Ephemeral,
                    withResponse: true,
                });
                const newMsgId = response?.resource?.message?.id;
                if (newMsgId) {
                    client._lbCache.set(newMsgId, {
                        sorted, totalPages, userPage, event, page,
                        interactionUserId: userId,
                        ephemeral: true,
                    });
                    client._lbUserCache.delete(userId);
                } else {
                    // Keep userCache as fallback if we couldn't get the msgId
                    client._lbUserCache.set(userId, { sorted, totalPages, userPage, event, page });
                }
            } else {
                // The interaction is on their own ephemeral (no msgId cached yet).
                // update() will edit it in-place.
                await interaction.update({ embeds: [embed], components: [selectRow, buttonRow] });
                // Now cache by msgId so future interactions hit Case 2A
                client._lbCache.set(msgId, {
                    sorted, totalPages, userPage, event, page,
                    interactionUserId: userId,
                    ephemeral: true,
                });
                client._lbUserCache.delete(userId);
            }
            return;
        }

        // ── CASE 3: No state at all — spawn a fresh ephemeral ────────────────
        // Inherit the event from whichever message was clicked, if available.
        let event = msgCache?.event ?? 'dankmemer';
        if (isSelect) event = interaction.values[0];

        const state = buildState(event, userId);
        const page = 0;

        if (state.sorted.length === 0) {
            return interaction.reply({
                content: 'No donation data found.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const { embed, selectRow, buttonRow } = await buildComponents(state, page, interaction);

        // Park state in userCache as a fallback while we await the reply
        client._lbUserCache.set(userId, { ...state, page });

        const response = await interaction.reply({
            embeds: [embed],
            components: [selectRow, buttonRow],
            flags: MessageFlags.Ephemeral,
            withResponse: true,
        });

        const newMsgId = response?.resource?.message?.id;
        if (newMsgId) {
            client._lbCache.set(newMsgId, {
                ...state, page,
                interactionUserId: userId,
                ephemeral: true,
            });
            client._lbUserCache.delete(userId);
        }
        // If newMsgId is undefined, userCache stays as the fallback (Case 2B handles future clicks)
    },
};