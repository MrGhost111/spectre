const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'activity',
    async execute(message, args) {
        // Check if the user has the required role
        const requiredRole = '712970141834674207';
        if (!message.member.roles.cache.has(requiredRole)) {
            return message.reply('You do not have permission to view the setnote leaderboard.');
        }

        try {
            // Path to donoLogs.json file (which contains setnote data)
            const setnotePath = path.join(__dirname, '../data/donoLogs.json'); // Adjust path if needed
            const setnoteData = JSON.parse(fs.readFileSync(setnotePath, 'utf8'));

            // Convert to array and sort by count
            const sortedUsers = Object.entries(setnoteData)
                .sort(([, a], [, b]) => b - a); // Sort in descending order by the count value

            if (sortedUsers.length === 0) {
                return message.reply('No setnote data available to display!');
            }

            // Create leaderboard entries, checking for message size limit
            let lbMessage = '';
            const leaderboardEntries = await Promise.all(
                sortedUsers.map(async ([userId, count], index) => {
                    const position = index + 1; // Ranking position (1-based index)
                    const fetchedUser = await message.client.users.fetch(userId).catch(() => null);
                    const userTag = fetchedUser ? fetchedUser.tag : 'Unknown User';

                    // Show the emoji only for the top user
                    const userEmoji = index === 0 ? ' <:sweg:1010054002202906634> ' : '';

                    const entry = `**${position}.** ┊ <@${userId}>: ${count}${userEmoji}\n`;

                    // Check if adding this entry exceeds the message limit
                    if ((lbMessage + entry).length > 2000) {
                        return message.reply('Leaderboard too long! Displaying as many users as possible:');
                    }

                    lbMessage += entry;
                    return entry;
                })
            );

            // Get user's rank (if they exist in the logs)
            const userRank = Object.keys(setnoteData).findIndex(user => user === message.author.id) + 1 || 0;

            // Create the embed
            const lbEmbed = new EmbedBuilder()
                .setTitle('🏆 Setnote Leaderboard')
                .setColor(0x00AE86)
                .setDescription(lbMessage || 'No setnote data available to display.')
                .setFooter({ text: `Your rank: ${userRank > 0 ? userRank : 'Unranked'}` });

            return message.reply({ embeds: [lbEmbed] });
        } catch (error) {
            console.error('Error in activity command:', error);
            return message.reply('There was an error fetching the setnote leaderboard!');
        }
    },
};

