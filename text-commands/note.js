const { EmbedBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

module.exports = {
    name: 'note',
    description: 'View a specific user\'s donation note',
    async execute(message, args) {
        const userInput = args[0] || message.author.id;
        const filePath = path.join(__dirname, '..', 'data', 'users.json');

        if (!fs.existsSync(filePath)) {
            return message.reply('No data file found.');
        }

        const rawData = fs.readFileSync(filePath, 'utf8');
        const users = JSON.parse(rawData);

        let userId;
        if (message.mentions.users.size > 0) {
            userId = message.mentions.users.first().id;
        } else if (!isNaN(userInput)) {
            userId = userInput;
        } else {
            // Try to find the user by username
            const user = message.guild.members.cache.find(member => member.user.username === userInput);
            if (user) {
                userId = user.id;
            } else {
                return message.reply('User not found.');
            }
        }

        if (!users[userId]) {
            users[userId] = { total: 0 }; // Set default if user is not in the JSON file
        }

        const user = message.guild.members.cache.get(userId) || await message.guild.members.fetch(userId).catch(() => null);
        const userTag = user ? user.user.tag : 'Unknown User';

        const embed = new EmbedBuilder()
            .setTitle(`Donation Note for ${userTag}`)
            .setDescription(`Total Donations: ⏣ ${users[userId].total.toLocaleString()}`)
            .setColor('#6666FF');

        message.channel.send({ embeds: [embed] });
    },
};
