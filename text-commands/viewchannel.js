const { EmbedBuilder, Colors, PermissionsBitField, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../data/channels.json');

const ROLE_CONFIG = {
    '768448955804811274': { limit: 5 },
    '768449168297033769': { limit: 5 },
    '946729964328337408': { limit: 5 },
    '1028256286560763984': { limit: 5 },
    '1028256279124250624': { limit: 5 },
    '1038106794200932512': { limit: 5 },
    '783032959350734868': { limit: 10 },
    '1038888209440067604': { limit: 5, requiresRole: '783032959350734868' },
    '1349716423706148894': { limit: 5 },
};

module.exports = {
    name: 'viewc',
    description: 'Admin command to view channel info',
    async execute(message, args) {
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

        // Fetch owner — handle if they've left
        let ownerStatus;
        let ownerRoles;
        try {
            const owner = await message.guild.members.fetch(userChannel.userId);
            ownerStatus = `<@${userChannel.userId}>`;
            ownerRoles = owner.roles.cache;
        } catch {
            ownerStatus = `${userChannel.userId} (left the server)`;
            ownerRoles = new Collection();
        }

        const maxFriends = calculateMaxFriends(ownerRoles);

        const roleThresholds = Object.entries(ROLE_CONFIG).map(([roleId, config]) => {
            const hasRole = ownerRoles.has(roleId);
            const emoji = hasRole ? '<a:tick:1276746433495830620>' : '<a:crossmark:1276746067026903061>';
            return `${emoji} <@&${roleId}> ${config.limit}`;
        }).join('\n');

        // Build friends list, noting who has left the server
        const friendsListLines = [];
        for (const friendId of userChannel.friends) {
            const member = await message.guild.members.fetch(friendId).catch(() => null);
            if (member) {
                friendsListLines.push(`<@${friendId}>`);
            } else {
                friendsListLines.push(`<@${friendId}> *(left the server)*`);
            }
        }
        const friendsList = friendsListLines.length > 0
            ? friendsListLines.join('\n')
            : 'No friends in the channel.';

        const embed = new EmbedBuilder()
            .setTitle('Channel Information')
            .setDescription(
                `<:invisible:1277372701710749777>\n` +
                `**Channel:** <#${channelInfo.id}>\n\n` +
                `**Owner:** ${ownerStatus}\n\n` +
                `**Created On:** <t:${Math.floor(channelInfo.createdTimestamp / 1000)}:D>\n\n` +
                `**Friends:** ${userChannel.friends.length} / ${maxFriends}\n\n` +
                `**Invited Friends:**\n${friendsList}\n\n` +
                `**Role Thresholds:**\n${roleThresholds}`
            )
            .setColor(ownerStatus.includes('(left the server)') ? Colors.Red : Colors.Green);

        await message.reply({ embeds: [embed] });
    }
};

function calculateMaxFriends(rolesCache) {
    let total = 0;
    for (const [roleId, config] of Object.entries(ROLE_CONFIG)) {
        if (rolesCache.has(roleId)) {
            if (config.requiresRole) {
                if (rolesCache.has(config.requiresRole)) total += config.limit;
            } else {
                total += config.limit;
            }
        }
    }
    return total;
}