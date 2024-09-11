const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'removenote',
    aliases: ['rm'],
    description: 'Remove a donation note from a user',
    async execute(message, args) {
        // Check if the user has the correct role
        if (!message.member.roles.cache.has('710572344745132114')) {
            return message.reply('You do not have permission to use this command.');
        }

        const usersFilePath = path.join(__dirname, '../data', 'users.json');
        let usersData = {};

        // Read existing users data
        if (fs.existsSync(usersFilePath)) {
            const rawData = fs.readFileSync(usersFilePath, 'utf8');
            usersData = JSON.parse(rawData);
        }

        // Parse command arguments
        const userArg = args.shift();
        const amountToRemove = parseInt(args.join(' ').replace(/,/g, ''), 10);

        // Find user ID from mention, username, or ID
        const user = message.mentions.users.first() || 
            message.guild.members.cache.find(member => member.user.username === userArg)?.user || 
            message.guild.members.cache.get(userArg) || 
            message.client.users.cache.get(userArg);

        if (!user) {
            return message.reply('User not found.');
        }

        const userId = user.id;

        // Check if user data exists
        if (!usersData[userId]) {
            return message.reply('No notes found for this user.');
        }

        // Remove amount from user
        if (usersData[userId].total < amountToRemove) {
            return message.reply('Amount to remove is greater than the user\'s current total.');
        }

        usersData[userId].total -= amountToRemove;
        fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2), 'utf8');
        message.reply(`Removed ${amountToRemove.toLocaleString()} coins from ${user.tag}.`);
    },
};
