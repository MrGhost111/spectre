// commands/leaderboard.js

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { loadDonations, formatFull, formatNumber } = require('../Donations/noteSystem');

const PAGE_SIZE = 10;

function buildLeaderboardEmbed(sorted, page, totalPages, requesterId) {
    const start = page * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, sorted.length);
    const entries = sorted.slice(start, end);

    let description = '';
    for (let i = 0; i < entries.length; i++) {
        const rank = start + i + 1;
        const { userId, total } = entries[i];
        const isYou = userId === requesterId;

        const prefix = rank === 1
            ? '<:winners:1000018706874781806>'
            : '<:purpledot:860074414853586984>';

        const youTag = isYou ? ' **← you**' : '';
        description += `${prefix} **#${rank}** <@${userId}> — ⏣ ${formatFull(total)} *(${formatNumber(total)})*${youTag}\n`;
    }

    return new EmbedBuilder()
        .setTitle('<:lbtest:1064919048242090054>  Donation Leaderboard')
        .setColor('#4c00b0')
        .setDescription(description || 'No donation data found.')
        .setFooter({ text: `Page ${page + 1} of ${totalPages} • Showing #${start + 1}–#${end} of ${sorted.length} users` })
        .setTimestamp();
}

function buildLeaderboardButtons(page, totalPages, userPage) {
    const onFirstPage    = page === 0;
    const onLastPage     = page >= totalPages - 1;
    const myRankDisabled = userPage === -1 || page === userPage;

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`lb_first_${page}`)
            .setLabel('<<')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(onFirstPage),
        new ButtonBuilder()
            .setCustomId(`lb_prev_${page}`)
            .setLabel('<')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(onFirstPage),
        new ButtonBuilder()
            .setCustomId(`lb_myrank_${page}`)
            .setLabel('My Rank')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(myRankDisabled),
        new ButtonBuilder()
            .setCustomId(`lb_next_${page}`)
            .setLabel('>')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(onLastPage),
        new ButtonBuilder()
            .setCustomId(`lb_last_${page}`)
            .setLabel('>>')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(onLastPage),
    );
}

module.exports = {
    name: 'leaderboard',
    async execute(message, args) {
        const data = loadDonations();

        const sorted = Object.entries(data)
            .map(([userId, userData]) => ({ userId, total: userData?.totalDonated ?? 0 }))
            .filter(e => e.total > 0)
            .sort((a, b) => b.total - a.total);

        if (sorted.length === 0) {
            return message.reply('No donation data found.');
        }

        const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
        const userIndex  = sorted.findIndex(e => e.userId === message.author.id);
        const userPage   = userIndex === -1 ? -1 : Math.floor(userIndex / PAGE_SIZE);

        const page    = 0;
        const embed   = buildLeaderboardEmbed(sorted, page, totalPages, message.author.id);
        const buttons = buildLeaderboardButtons(page, totalPages, userPage);

        const reply = await message.reply({ embeds: [embed], components: [buttons] });

        // Cache the sorted data so the button handler in interactionCreate.js can use it
        if (!message.client._lbCache) message.client._lbCache = new Map();
        message.client._lbCache.set(reply.id, {
            sorted,
            totalPages,
            userPage,
            interactionUserId: message.author.id,
            expiresAt: Date.now() + 10 * 60 * 1000, // 10 min TTL
        });
    },
};
