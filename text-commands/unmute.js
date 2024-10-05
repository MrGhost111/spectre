const { PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'unmute',
    description: 'Unmutes a user by removing the muted role.',
    async execute(message, args) {
        // Check if the command issuer is the specified user (you)
        if (message.author.id !== '753491023208120321') {
            return;
        }

        // Check if a user mention, ID, or username is provided
        const userToUnmute = message.mentions.users.first() || message.guild.members.cache.find(member => member.user.username === args[0] || member.id === args[0]);
        
        if (!userToUnmute) {
            return message.reply('Please mention a user or provide their username/ID.');
        }

        // Get the member from the guild
        const member = message.guild.members.cache.get(userToUnmute.id);
        
        if (!member) {
            return message.reply('User not found in this server.');
        }

        // Remove the muted role
        const mutedRole = message.guild.roles.cache.get('673978861335085107');
        
        if (!mutedRole) {
            return message.reply('Muted role not found.');
        }

        try {
            await member.roles.remove(mutedRole);
            // React with the success emoji
            message.react('<a:tickloop:926319357288648784>');
        } catch (error) {
            console.error(error);
            message.reply('There was an error unmuting the user. Please try again later.');
        }
    },
};
