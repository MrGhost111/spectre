// commands/leaderboard.js  (text command)
// Usage: ,leaderboard
// Shows the Dank Memer donation leaderboard with pagination buttons and event selector.
// Delegates rendering entirely to the slash command helpers.
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
        const userIndex = sorted.findIndex(e => e.userId === [message.author.id](http://message.author.id));
        const userPage = userIndex === -1 ? -1 : Math.floor(userIndex / 10);
        const page = 0;
        // buildLeaderboard expects an interaction-like object for [user.id](http://user.id) and guild.members.fetch
        const interactionLike = {
            user: [message.author](http://message.author),
                guild: message.guild,
        };
        const embed = await buildLeaderboard(sorted, page, totalPages, interactionLike, event);
        const selectRow = buildSelectMenu(event);
        const buttonRow = buildButtons(page, totalPages, userPage);
        const sent = await [message.channel](http://message.channel).send({
            embeds: [embed],
            components: [selectRow, buttonRow],
        });
    // Register in the lb cache so leaderboardInteraction.js can handle button/select events
    if(!message.client._lbCache) message.client._lbCache = new Map();
    message.client._lbCache.set([sent.id](http://sent.id), {
        sorted,
        totalPages,
        userPage,
        event,
        page,
        interactionUserId: [message.author.id](http://message.author.id),
        });
    },
};

