// events/leaderboardInteraction.js

const { buildLeaderboard, buildSelectMenu, buildButtons, getSorted } =
    require('../slashCommands/leaderboard')._helpers;

module.exports = {
    name: 'interactionCreate',
    once: false,

    async execute(client, interaction) {
        // ── Select menu — switch event ────────────────────────────────────────
        if (interaction.isStringSelectMenu() && interaction.customId === 'lb_event_select') {
            const cache = client._lbCache?.get(interaction.message.id);

            if (cache && interaction.user.id !== cache.interactionUserId) {
                return interaction.reply({ content: 'Only the person who ran this command can switch tabs.', ephemeral: true });
            }

            const event = interaction.values[0];
            const sorted = getSorted(event);

            if (sorted.length === 0) {
                await interaction.update({
                    content: `No donation data found for ${event}.`,
                    embeds: [],
                    components: [],
                });
                return;
            }

            const totalPages = Math.ceil(sorted.length / 10);
            const userIndex = sorted.findIndex(e => e.userId === interaction.user.id);
            const userPage = userIndex === -1 ? -1 : Math.floor(userIndex / 10);
            const page = 0;

            const embed = buildLeaderboard(sorted, page, totalPages, interaction, event);
            const selectRow = buildSelectMenu(event);
            const buttonRow = buildButtons(page, totalPages, userPage);

            if (cache) {
                cache.sorted = sorted;
                cache.totalPages = totalPages;
                cache.userPage = userPage;
                cache.event = event;
                cache.expiresAt = Date.now() + 10 * 60 * 1000;
            }

            await interaction.update({ embeds: [embed], components: [selectRow, buttonRow] });
            return;
        }

        // ── Buttons — pagination ──────────────────────────────────────────────
        if (!interaction.isButton()) return;

        const id = interaction.customId;
        if (!id.startsWith('lb_')) return;

        const cache = client._lbCache?.get(interaction.message.id);
        if (!cache) {
            return interaction.reply({ content: 'This leaderboard has expired. Run `/leaderboard` again.', ephemeral: true });
        }

        if (Date.now() > cache.expiresAt) {
            client._lbCache.delete(interaction.message.id);
            return interaction.reply({ content: 'This leaderboard has expired. Run `/leaderboard` again.', ephemeral: true });
        }

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