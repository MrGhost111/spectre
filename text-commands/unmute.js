const { PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'unmute',
    description: 'Unmutes a user by removing the muted role.',
    async execute(message, args) {
        // Check if the command issuer is the specified user (you)
        if (message.author.id !== '753491023208120321') {
            return message.reply('You do not have permission to use this command.');
        }

        let userToUnmute = null;

        // Priority 1: Check if a user is mentioned or ID/username provided in args
        if (args.length > 0) {
            userToUnmute = message.mentions.users.first() ||
                message.guild.members.cache.find(member =>
                    member.user.username.toLowerCase() === args.join(' ').toLowerCase() ||
                    member.id === args[0]
                );
        }

        // Priority 2: Check if replying to someone
        if (!userToUnmute && message.reference) {
            try {
                const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                if (repliedMessage) {
                    userToUnmute = repliedMessage.author;
                }
            } catch (error) {
                console.error('Error fetching replied message:', error);
            }
        }

        // Priority 3: If no user specified and no reply, unmute the command author
        if (!userToUnmute) {
            userToUnmute = message.author;
        }

        // Get the member from the guild
        const member = message.guild.members.cache.get(userToUnmute.id);

        if (!member) {
            return message.reply('User not found in this server.');
        }

        // Get the muted role
        const mutedRole = message.guild.roles.cache.get('673978861335085107');

        if (!mutedRole) {
            return message.reply('Muted role not found.');
        }

        // Check if user even has the muted role
        if (!member.roles.cache.has(mutedRole.id)) {
            return message.reply(`${member.user.tag} is not currently muted.`);
        }

        try {
            await member.roles.remove(mutedRole);

            // React with the success emoji
            await message.react('<a:tickloop:926319357288648784>');

            // Send confirmation message
            if (userToUnmute.id === message.author.id) {
                await message.reply('You have been unmuted.');
            } else {
                await message.reply(`Successfully unmuted ${member.user.tag}.`);
            }
        } catch (error) {
            console.error(error);
            message.reply('There was an error unmuting the user. Please try again later.');
        }
    },
};