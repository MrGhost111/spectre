// events/leaderboardInteraction.js
const { buildLeaderboard, buildSelectMenu, buildButtons, getSorted } =
    require('../commands/leaderboard')._helpers;

const PAGE_SIZE = 10;

async function spawnEphemeralLeaderboard(interaction, event, page = 0) {
    const sorted = getSorted(event);
    if (sorted.length === 0) {
        return interaction.reply({ content: 'No donation data found.', ephemeral: true });
    }

    const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
    const userIndex = sorted.findIndex(e => e.userId === interaction.user.id);
    const userPage = userIndex === -1 ? -1 : Math.floor(userIndex / PAGE_SIZE);
    const clampedPage = Math.min(page, totalPages - 1);

    const embed = buildLeaderboard(sorted, clampedPage, totalPages, interaction, event);
    const selectRow = buildSelectMenu(event);
    const buttonRow = buildButtons(clampedPage, totalPages, userPage);

    await interaction.reply({
        embeds: [embed],
        components: [selectRow, buttonRow],
        ephemeral: true,
    });

    const msg = await interaction.fetchReply();

    if (!interaction.client._lbCache) interaction.client._lbCache = new Map();
    interaction.client._lbCache.set(msg.id, {
        sorted,
        totalPages,
        userPage,
        interactionUserId: interaction.user.id,
        event,
    });
}

module.exports = {
    name: 'interactionCreate',
    once: false,
    async execute(interaction) {
        const client = interaction.client;

        // ── Select menu — switch event ────────────────────────────────────────
        if (interaction.isStringSelectMenu() && interaction.customId === 'lb_event_select') {
            const cache = client._lbCache?.get(interaction.message.id);
            const event = interaction.values[0];

            // Not the author — give them their own ephemeral leaderboard
            if (!cache || interaction.user.id !== cache.interactionUserId) {
                return spawnEphemeralLeaderboard(interaction, event, 0);
            }

            const sorted = getSorted(event);
            if (sorted.length === 0) {
                return interaction.update({
                    content: `No donation data found for ${event}.`,
                    embeds: [],
                    components: [],
                });
            }

            const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
            const userIndex = sorted.findIndex(e => e.userId === interaction.user.id);
            const userPage = userIndex === -1 ? -1 : Math.floor(userIndex / PAGE_SIZE);
            const page = 0;

            const embed = buildLeaderboard(sorted, page, totalPages, interaction, event);
            const selectRow = buildSelectMenu(event);
            const buttonRow = buildButtons(page, totalPages, userPage);

            cache.sorted = sorted;
            cache.totalPages = totalPages;
            cache.userPage = userPage;
            cache.event = event;

            await interaction.update({ embeds: [embed], components: [selectRow, buttonRow] });
            return;
        }

        // ── Buttons — pagination ──────────────────────────────────────────────
        if (!interaction.isButton()) return;
        const id = interaction.customId;
        if (!id.startsWith('lb_')) return;

        const cache = client._lbCache?.get(interaction.message.id);

        // No cache at all — spawn a fresh ephemeral for them
        if (!cache) {
            return spawnEphemeralLeaderboard(interaction, 'dankmemer', 0);
        }

        // Not the author — spawn their own ephemeral on same event/page
        if (interaction.user.id !== cache.interactionUserId) {
            const parts = id.split('_');
            const currentPage = parseInt(parts[parts.length - 1], 10);
            return spawnEphemeralLeaderboard(interaction, cache.event, currentPage);
        }

        // Author — handle pagination normally
        const { sorted, totalPages, userPage, event } = cache;
        const parts = id.split('_');
        const currentPage = parseInt(parts[parts.length - 1], 10);
        let newPage = currentPage;

        if (id.startsWith('lb_first_')) newPage = 0;
        if (id.startsWith('lb_prev_')) newPage = Math.max(0, currentPage - 1);
        if (id.startsWith('lb_next_')) newPage = Math.min(totalPages - 1, currentPage + 1);
        if (id.startsWith('lb_last_')) newPage = totalPages - 1;
        if (id.startsWith('lb_myrank_')) newPage = userPage;

        const embed = buildLeaderboard(sorted, newPage, totalPages, interaction, event);
        const selectRow = buildSelectMenu(event);
        const buttonRow = buildButtons(newPage, totalPages, userPage);

        await interaction.update({ embeds: [embed], components: [selectRow, buttonRow] });
    },
};