const { EmbedBuilder, Colors, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../data/channels.json');

const ARCHIVED_CATEGORY_ID = '1273361676355244102';

module.exports = {
    name: 'seec',
    description: 'List all channels a user is part of and re-add them if missing.',
    async execute(message, args) {
        const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);

        // Resolve target user — admins can pass a mention or raw user ID
        let targetUser = message.author;
        if (args[0]) {
            if (!isAdmin) {
                return message.reply({
                    content: 'Only admins can look up other users.',
                    allowedMentions: { repliedUser: false },
                });
            }
            // Support both mention and raw ID
            const mentionedUser = message.mentions.users.first();
            if (mentionedUser) {
                targetUser = mentionedUser;
            } else if (/^\d{17,19}$/.test(args[0])) {
                try {
                    targetUser = await message.client.users.fetch(args[0]);
                } catch {
                    return message.reply({
                        content: 'Could not find a user with that ID.',
                        allowedMentions: { repliedUser: false },
                    });
                }
            } else {
                return message.reply({
                    content: 'Please provide a valid user mention or user ID.',
                    allowedMentions: { repliedUser: false },
                });
            }
        }

        const userId = targetUser.id;
        const channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

        // Collect all channel IDs this user is part of (owned or friended)
        const userChannelIds = [];

        const ownedChannel = Object.values(channelsData).find(ch => ch.userId === userId);
        if (ownedChannel) {
            userChannelIds.push(ownedChannel.channelId);
        }

        for (const channelInfo of Object.values(channelsData)) {
            if (channelInfo?.friends?.includes(userId)) {
                if (!userChannelIds.includes(channelInfo.channelId)) {
                    userChannelIds.push(channelInfo.channelId);
                }
            }
        }

        if (userChannelIds.length === 0) {
            return message.reply({
                content: userId === message.author.id
                    ? 'You are not listed in any channels.'
                    : `<@${userId}> is not listed in any channels.`,
                allowedMentions: { parse: [] },
            });
        }

        // Re-add user to channels they're listed in but missing permissions for
        // (skips archived channels)
        const addedChannels = [];
        const skippedChannels = [];

        for (const channelId of userChannelIds) {
            const channel = message.guild.channels.cache.get(channelId);
            if (!channel) continue;
            if (channel.parentId === ARCHIVED_CATEGORY_ID) continue;

            if (!channel.permissionOverwrites.cache.has(userId)) {
                try {
                    await channel.permissionOverwrites.edit(userId, {
                        [PermissionsBitField.Flags.ViewChannel]: true,
                    });
                    addedChannels.push(channelId);
                } catch (error) {
                    console.error(`Failed to add ${targetUser.tag} to channel ${channel.name}:`, error);
                    skippedChannels.push(channelId);
                }
            }
        }

        // Build channel list for embed
        const channelLines = userChannelIds.map(id => {
            const channel = message.guild.channels.cache.get(id);
            if (!channel) return `Unknown channel (\`${id}\`)`;
            const isArchived = channel.parentId === ARCHIVED_CATEGORY_ID;
            const wasAdded = addedChannels.includes(id);
            const failed = skippedChannels.includes(id);
            let suffix = '';
            if (isArchived) suffix = ' *(archived)*';
            else if (wasAdded) suffix = ' *(re-added)*';
            else if (failed) suffix = ' *(failed to re-add)*';
            return `<#${id}>${suffix}`;
        });

        const isSelf = userId === message.author.id;
        const embed = new EmbedBuilder()
            .setTitle(isSelf ? 'Your Channels' : `Channels for ${targetUser.username}`)
            .setDescription(
                `${isSelf ? 'You have' : `<@${userId}> has`} access to the following channels:\n\n` +
                channelLines.join('\n')
            )
            .setColor(Colors.Green);

        await message.reply({
            embeds: [embed],
            allowedMentions: { repliedUser: false },
        });
    }
};