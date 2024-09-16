const { EmbedBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

module.exports = {
    name: 'lb',
    description: 'Displays the top 10 donors',
    async execute(message) {
        const filePath = path.join(__dirname, '..', 'data', 'users.json');
        
        if (!fs.existsSync(filePath)) {
            return message.reply('No data file found.');
        }

        const rawData = fs.readFileSync(filePath, 'utf8');
        const users = JSON.parse(rawData);

        // Convert users object to array and sort by total donations in descending order
        const sortedUsers = Object.entries(users)
            .map(([userId, userData]) => ({ userId, total: userData.total || 0 }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10); // Get top 10 donors

        // Create embed
        const embed = new EmbedBuilder()
            .setTitle('Top 10 Donors')
            .setColor('#6666FF')
            .setDescription(sortedUsers.length > 0
                ? sortedUsers.map((user, index) => `**${index + 1}.** <@${user.userId}> ⏣ ${user.total.toLocaleString()}`).join('\n')
                : 'No donors found.');

        message.channel.send({ embeds: [embed] });
    },
};
