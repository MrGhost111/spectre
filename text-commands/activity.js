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
            // Path to donoLogs.json file
            const setnotePath = path.join(__dirname, '../data/donoLogs.json');
            const setnoteData = JSON.parse(fs.readFileSync(setnotePath, 'utf8'));

            // Convert to array and sort by count
            const sortedUsers = Object.entries(setnoteData)
                .sort(([, a], [, b]) => b - a); // Sort in descending order

            if (sortedUsers.length === 0) {
                return message.reply('No setnote data available to display!');
            }

            // First, fetch all users to avoid race conditions
            const usersFetched = await Promise.all(
                sortedUsers.map(async ([userId]) => {
                    try {
                        return await message.client.users.fetch(userId);
                    } catch {
                        return null;
                    }
                })
            );

            // Then build the leaderboard string in order
            let lbMessage = '';
            for (let i = 0; i < sortedUsers.length; i++) {
                const [userId, count] = sortedUsers[i];
                const position = i + 1;
                const fetchedUser = usersFetched[i];
                const userTag = fetchedUser ? fetchedUser.tag : 'Unknown User';
                const userEmoji = i === 0 ? ' <:sweg:1010054002202906634> ' : '';
                const entry = `**${position}.** ┊ <@${userId}>: ${count}${userEmoji}\n`;

                // Check message length limit
                if ((lbMessage + entry).length > 2000) {
                    break;
                }
                lbMessage += entry;
            }

            // Get user's rank
            const userRank = sortedUsers.findIndex(([userId]) => userId === message.author.id) + 1 || 0;

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
