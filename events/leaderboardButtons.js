// JavaScript source code
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const streaksPath = path.join(__dirname, '../../data/streaks.json');

module.exports = async function handleLeaderboardButton(interaction) {
    let streakData = {};
    try {
        streakData = JSON.parse(fs.readFileSync(streaksPath, 'utf8'));
    } catch (error) {
        console.error(`Error reading streaks file: ${error}`);
        return interaction.reply({ content: 'Failed to load leaderboard data.', ephemeral: true });
    }

    if (!streakData.users || !Array.isArray(streakData.users)) {
        return interaction.reply({ content: 'No streak data available.', ephemeral: true });
    }

    const rankEmojis = [
        '<:One:1043063155653357568>',
        '<:Two:1043063239493300294>',
        '<:Three:1043063324423757885>',
        '<:Four:1043085748796129301>',
        '<:Five:1043085910432030760>'
    ];

    const sortedStreaks = streakData.users
        .sort((a, b) => b.streak - a.streak)
        .slice(0, 5);

    const leaderboardEntries = await Promise.all(sortedStreaks.map(async (user, index) => {
        const fetchedUser = await interaction.client.users.fetch(user.userId).catch(() => null);
        const userTag = fetchedUser ? fetchedUser.tag : 'Unknown User';
        const userEmoji = interaction.user.id === user.userId ? '<:sweg:1010054002202906634>' : '';
        return `${rankEmojis[index] || ''} ┊ ${userTag} - ${user.streak} ${userEmoji}`;
    }));

    const yourRank = streakData.users.findIndex(u => u.userId === interaction.user.id) + 1 || 0;

    return interaction.reply({
        embeds: [new EmbedBuilder()
            .setTitle('Leaderboard: Streak')
            .setColor(0x6666FF)
            .setDescription(leaderboardEntries.join('\n') || 'No streaks available.')
            .setFooter({ text: `Your rank: ${yourRank}` })],
        ephemeral: true
    });
};