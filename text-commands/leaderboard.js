// textcommands/leaderboard.js
// Usage: ,leaderboard  (or ,lb)

const { buildLeaderboard, buildSelectMenu, buildButtons, getSorted } =
    require('../commands/leaderboard')._helpers;

module.exports = {
    name: 'leaderboard',
    aliases: ['lb'],
    description: 'View the donation leaderboard.',

    async execute(message) {
        const event = 'dankmemer';
        const sorted = getSorted(event);

        if (sorted.length === 0) {
            return message.reply('No donation data found.');
        }

        const totalPages = Math.ceil(sorted.length / 10);
        const userIndex = sorted.findIndex(e => e.userId === message.author.id);
        const userPage = userIndex === -1 ? -1 : Math.floor(userIndex / 10);
        const page = 0;

        const interactionLike = {
            user: message.author,
            guild: message.guild,
        };

        const embed = await buildLeaderboard(sorted, page, totalPages, interactionLike, event);
        const selectRow = buildSelectMenu(event);
        const buttonRow = buildButtons(page, totalPages, userPage);

        const sent = await message.channel.send({
            embeds: [embed],
            components: [selectRow, buttonRow],
        });

        if (!message.client._lbCache) message.client._lbCache = new Map();
        message.client._lbCache.set(sent.id, {
            sorted,
            totalPages,
            userPage,
            event,
            page,
            interactionUserId: message.author.id,
        });
    },
};