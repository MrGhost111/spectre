const { EmbedBuilder, Colors, PermissionsBitField, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../data/channels.json');

module.exports = {
    name: 'viewc',
    description: 'Admin command to view channel info',
    async execute(message, args) {
        // Check for admin permissions
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('This command is only available to admins.');
        }

        const userMention = message.mentions.users.first();
        const channelMention = message.mentions.channels.first();
        const channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

        let userChannel;
        if (userMention) {
            userChannel = Object.values(channelsData).find(ch => ch.userId === userMention.id);
        } else if (channelMention) {
            userChannel = Object.values(channelsData).find(ch => ch.channelId === channelMention.id);
        } else {
            return message.reply('Please mention a user or a channel to view.');
        }

        if (!userChannel) {
            return message.reply('No channel found for the specified user or channel.');
        }

        const channelInfo = message.guild.channels.cache.get(userChannel.channelId);
        if (!channelInfo) {
            return message.reply('Channel not found or it may have been deleted.');
        }

        // Determine owner status
        let ownerStatus;
        let ownerRoles;
        try {
            const owner = await message.guild.members.fetch(userChannel.userId);
            ownerStatus = `<@${userChannel.userId}>`;
            ownerRoles = owner.roles.cache;
        } catch (error) {
            // Owner not in the server
            ownerStatus = `${userChannel.userId} (left the server)`;
            ownerRoles = new Collection(); // Empty collection if user is not in the server
        }

        // Calculate the maximum number of friends
        const maxFriends = calculateMaxFriends(ownerRoles);
        const currentFriendsCount = userChannel.friends.length;

        // Define role thresholds
        const roles = [
            { id: '768448955804811274', limit: 5 },
            { id: '768449168297033769', limit: 5 },
            { id: '946729964328337408', limit: 5 },
            { id: '1028256286560763984', limit: 5 },
            { id: '1028256279124250624', limit: 5 },
            { id: '1038106794200932512', limit: 5 },
            { id: '1038888209440067604', limit: 5 },
            { id: '783032959350734868', limit: 10 }
        ];

        const roleThresholds = roles.map(role => {
            const hasRole = ownerRoles.has(role.id);
            const emoji = hasRole ? '<a:tick:1276746433495830620>' : '<a:crossmark:1276746067026903061>';
            console.log(`Role ${role.id} detected for owner: ${hasRole}`);
            return `${emoji} <@&${role.id}> ${role.limit}`;
        }).join('\n');

        // Prepare the friends list
        const friendsList = userChannel.friends.length > 0
            ? userChannel.friends.map(id => `<@${id}>`).join(', ')
            : 'No friends in the channel.';

        // Create the embed
        const embed = new EmbedBuilder()
            .setTitle('Channel Information')
            .setDescription(
                `<:invisible:1277372701710749777>\n**Channel:** <#${channelInfo.id}>\n\n` +
                `**Owner:** ${ownerStatus}\n\n` +
                `**Created On:** <t:${Math.floor(channelInfo.createdTimestamp / 1000)}:D>\n\n` +
                `**Friends:** ${currentFriendsCount}/${maxFriends}\n\n` +
                `**Invited Friends:**\n${friendsList}\n\n` +
                `**Role Thresholds:**\n${roleThresholds}`
            )
            .setColor(ownerStatus.includes('(left the server)') ? Colors.Red : Colors.Green);

        await message.reply({ embeds: [embed] });
    }
};

// Helper function to calculate the maximum number of friends based on roles
function calculateMaxFriends(rolesCache) {
    const roles = [
            { id: '768448955804811274', limit: 5 },
            { id: '768449168297033769', limit: 5 },
            { id: '946729964328337408', limit: 5 },
            { id: '1028256286560763984', limit: 5 },
            { id: '1028256279124250624', limit: 5 },
            { id: '1038106794200932512', limit: 5 },
            { id: '1038888209440067604', limit: 5 },
            { id: '783032959350734868', limit: 10 }
    ];

    let totalLimit = 0;
    roles.forEach(role => {
        if (rolesCache.has(role.id)) {
            totalLimit += role.limit;
        }
    });

    return totalLimit;
}
