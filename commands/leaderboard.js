// commands/leaderboard.js

const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    MessageFlags,
} = require('discord.js');
const { loadDonations, formatFull, formatNumber, EVENT_LABELS, EVENT_CURRENCY } = require('../Donations/noteSystem');

const PAGE_SIZE = 10;

async function buildLeaderboard(sorted, page, totalPages, interaction, event) {
    const start = page * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, sorted.length);
    const entries = sorted.slice(start, end);

    const currency = EVENT_CURRENCY[event] ?? '';
    const eventLabel = EVENT_LABELS[event] ?? event;

    // Fetch all members on this page in one batch to get display names
    const userIds = entries.map(e => e.userId);
    const members = new Map();
    await Promise.all(
        userIds.map(id =>
            interaction.guild.members.fetch(id)
                .then(m => members.set(id, m))
                .catch(() => null) // user may have left the server
        )
    );

    const DOTS = [
        '<:orangedot:860074358092726312>',
        '<:aquadot:860074237954883585>',
        '<:purpledot:860074414853586984>',
        '<:dot:1003254232943693855>',
    ];
    const RICKROLL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

    let description = '';
    for (let i = 0; i < entries.length; i++) {
        const rank = start + i + 1;
        const { userId, total } = entries[i];
        const isYou = userId === interaction.user.id;
        const member = members.get(userId);
        const displayName = member?.displayName ?? 'Unknown User';
        const dot = DOTS[(rank - 1) % DOTS.length];
        const totalFmt = formatFull(total);
        const youTag = isYou ? '  <:sweg:1010054002202906634>' : '';

        description += `${dot} [${currency} ${totalFmt}](${RICKROLL}) - ${displayName} ${youTag}\n`;
    }

    return new EmbedBuilder()
        .setTitle(`<:lbtest:1064919048242090054>  ${eventLabel} Donation Leaderboard`)
        .setColor('#4c00b0')
        .setDescription(description || 'No donation data found.')
        .setFooter({ text: `Page ${page + 1} of ${totalPages}` })
        .setTimestamp();
}

function buildSelectMenu(currentEvent) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('lb_event_select')
            .setPlaceholder('Select event leaderboard')
            .addOptions([
                { label: 'Dank Memer', value: 'dankmemer', emoji: '<:PepeHappy:715539014412664873>', default: currentEvent === 'dankmemer' },
                { label: 'Investor', value: 'investor', emoji: '<a:cash:1498053763183808543>', default: currentEvent === 'investor' },
                { label: 'Karuta', value: 'karuta', emoji: '🎟️', default: currentEvent === 'karuta' },
                { label: 'OwO', value: 'owo', emoji: '<:hc_cowoncy:1498053388775194675>', default: currentEvent === 'owo' },
            ])
    );
}

function buildButtons(page, totalPages, userPage, disabled = false) {
    const onFirstPage = page === 0;
    const onLastPage = page >= totalPages - 1;
    const onUserPage = page === userPage;
    const userUnranked = userPage === -1;

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`lb_first_${page}`)
            .setLabel('<<')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || onFirstPage),
        new ButtonBuilder()
            .setCustomId(`lb_prev_${page}`)
            .setLabel('<')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || onFirstPage),
        new ButtonBuilder()
            .setCustomId(`lb_myrank_${page}`)
            .setEmoji('<:sweg:1010054002202906634>')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled || userUnranked || onUserPage),
        new ButtonBuilder()
            .setCustomId(`lb_next_${page}`)
            .setLabel('>')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || onLastPage),
        new ButtonBuilder()
            .setCustomId(`lb_last_${page}`)
            .setLabel('>>')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || onLastPage),
    );
}

function getSorted(event) {
    const data = loadDonations(event);
    return Object.entries(data)
        .map(([userId, userData]) => ({ userId, total: userData?.totalDonated ?? 0 }))
        .filter(e => e.total > 0)
        .sort((a, b) => b.total - a.total);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the donation leaderboard.'),

    async execute(interaction) {
        await interaction.deferReply();

        const event = 'dankmemer';
        const sorted = getSorted(event);

        if (sorted.length === 0) {
            return interaction.editReply({ content: 'No donation data found.' });
        }

        const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
        const userIndex = sorted.findIndex(e => e.userId === interaction.user.id);
        const userPage = userIndex === -1 ? -1 : Math.floor(userIndex / PAGE_SIZE);
        const page = 0;

        const embed = await buildLeaderboard(sorted, page, totalPages, interaction, event);
        const selectRow = buildSelectMenu(event);
        const buttonRow = buildButtons(page, totalPages, userPage);

        const reply = await interaction.editReply({
            embeds: [embed],
            components: [selectRow, buttonRow],
        });

        if (!interaction.client._lbCache) interaction.client._lbCache = new Map();
        interaction.client._lbCache.set(reply.id, {
            sorted,
            totalPages,
            userPage,
            event,
            page,
            interactionUserId: interaction.user.id,
        });
    },
};

module.exports._helpers = { buildLeaderboard, buildSelectMenu, buildButtons, getSorted };