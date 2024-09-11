const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'note',
    aliases: ['notes'],
    description: 'View or manage donation notes for users.',
    async execute(message, args) {
        const userId = message.mentions.users.first()?.id || args[0];
        const filePath = path.join(__dirname, '..', 'data', 'users.json');
        let usersData = {};

        if (fs.existsSync(filePath)) {
            const rawData = fs.readFileSync(filePath, 'utf8');
            usersData = JSON.parse(rawData);
        }

        let targetUserId;
        if (message.mentions.users.size > 0) {
            targetUserId = message.mentions.users.first().id;
        } else if (userId) {
            targetUserId = userId;
        } else {
            targetUserId = message.author.id;
        }

        const userNotes = usersData[targetUserId] || { total: 0 };
        const totalAmount = userNotes.total || 0;

        if (totalAmount === 0) {
            await message.reply(`User **${message.guild.members.cache.get(targetUserId)?.user.tag || 'Unknown User'}** has no donation amount assigned.`);
        } else {
            await message.reply({
                embeds: [{
                    title: 'Donation Note',
                    description: `User: **${message.guild.members.cache.get(targetUserId)?.user.tag || 'Unknown User'}**\nTotal Donations: **${totalAmount.toLocaleString()}** coins`,
                    color: 0x1abc9c
                }]
            });
        }
    }
};
