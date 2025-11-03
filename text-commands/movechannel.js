// JavaScript source code
const { PermissionsBitField, ChannelType } = require('discord.js');

module.exports = {
    name: 'movechannel',
    aliases: ['changecategory', 'relocate'],
    description: 'Move a channel to a different category or position',
    async execute(message, args, entities = null) {
        // Check permissions
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply('❌ You do not have permission to manage channels.');
        }

        let targetChannel = null;
        let targetCategory = null;
        let targetPosition = null;

        // Priority 1: Use entities from AI parser
        if (entities && entities.channels && entities.channels.length > 0) {
            targetChannel = entities.channels[0];

            // If there's a second channel mentioned, it might be the category
            if (entities.channels.length > 1) {
                const potentialCategory = entities.channels[1];
                if (potentialCategory.type === ChannelType.GuildCategory) {
                    targetCategory = potentialCategory;
                }
            }
        }

        // Priority 2: Check mentions
        if (!targetChannel) {
            const mentionedChannels = Array.from(message.mentions.channels.values());
            if (mentionedChannels.length > 0) {
                targetChannel = mentionedChannels[0];

                if (mentionedChannels.length > 1) {
                    const potentialCategory = mentionedChannels[1];
                    if (potentialCategory.type === ChannelType.GuildCategory) {
                        targetCategory = potentialCategory;
                    }
                }
            }
        }

        // Priority 3: Parse args
        if (args.length > 0) {
            const skipWords = ['to', 'in', 'the', 'move', 'channel', 'category', 'position'];
            const filteredArgs = args.filter(arg => !skipWords.includes(arg.toLowerCase()));

            for (const arg of filteredArgs) {
                // Check if it's a position number
                if (/^\d+$/.test(arg) && !targetPosition) {
                    targetPosition = parseInt(arg);
                    continue;
                }

                // Try to find channel by ID
                if (!targetChannel && /^\d{17,19}$/.test(arg)) {
                    const channel = message.guild.channels.cache.get(arg);
                    if (channel && channel.type !== ChannelType.GuildCategory) {
                        targetChannel = channel;
                        continue;
                    } else if (channel && channel.type === ChannelType.GuildCategory) {
                        targetCategory = channel;
                        continue;
                    }
                }

                // Try to find channel by name
                if (!targetChannel) {
                    const channel = message.guild.channels.cache.find(c =>
                        c.type !== ChannelType.GuildCategory &&
                        (c.name.toLowerCase() === arg.toLowerCase() ||
                            c.name.toLowerCase().includes(arg.toLowerCase()))
                    );
                    if (channel) {
                        targetChannel = channel;
                        continue;
                    }
                }

                // Try to find category by name
                if (!targetCategory) {
                    const category = message.guild.channels.cache.find(c =>
                        c.type === ChannelType.GuildCategory &&
                        (c.name.toLowerCase() === arg.toLowerCase() ||
                            c.name.toLowerCase().includes(arg.toLowerCase()))
                    );
                    if (category) {
                        targetCategory = category;
                    }
                }
            }
        }

        // Default to current channel if not specified
        if (!targetChannel) {
            if (message.channel.type === ChannelType.GuildCategory) {
                return message.reply('❌ Please specify a channel to move (not a category).');
            }
            targetChannel = message.channel;
        }

        // Validate we have something to do
        if (!targetCategory && targetPosition === null) {
            return message.reply('❌ Please specify a category or position to move the channel to.');
        }

        // Move channel
        try {
            const updates = {};

            if (targetCategory) {
                updates.parent = targetCategory.id;
            }

            if (targetPosition !== null) {
                updates.position = targetPosition;
            }

            await targetChannel.edit(updates);

            await message.react('<a:tickloop:926319357288648784>');

            let response = `✅ Successfully moved **${targetChannel.name}**`;
            if (targetCategory) {
                response += ` to category **${targetCategory.name}**`;
            }
            if (targetPosition !== null) {
                response += ` at position **${targetPosition}**`;
            }
            response += '.';

            return message.reply(response);
        } catch (error) {
            console.error('Error moving channel:', error);
            return message.reply('❌ There was an error trying to move the channel. Please try again.');
        }
    },
};