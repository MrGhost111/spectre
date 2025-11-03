// JavaScript source code
const { PermissionsBitField, ChannelType } = require('discord.js');

module.exports = {
    name: 'createchannel',
    aliases: ['newchannel', 'makechannel'],
    description: 'Create a new channel',
    async execute(message, args, entities = null) {
        // Check permissions
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply('❌ You do not have permission to manage channels.');
        }

        let channelName = null;
        let channelType = ChannelType.GuildText; // Default to text channel
        let targetCategory = null;
        let targetPosition = null;

        // Extract category from entities
        if (entities && entities.channels && entities.channels.length > 0) {
            const potentialCategory = entities.channels[0];
            if (potentialCategory.type === ChannelType.GuildCategory) {
                targetCategory = potentialCategory;
            }
        }

        // Parse args for channel name, type, category, and position
        if (args.length > 0) {
            const skipWords = ['in', 'the', 'create', 'new', 'make', 'channel', 'at', 'position'];
            let nameWords = [];

            for (let i = 0; i < args.length; i++) {
                const arg = args[i];
                const lowerArg = arg.toLowerCase();

                // Check for channel type keywords
                if (['voice', 'vc', 'voicechannel'].includes(lowerArg)) {
                    channelType = ChannelType.GuildVoice;
                    continue;
                }
                if (['text', 'textchannel'].includes(lowerArg)) {
                    channelType = ChannelType.GuildText;
                    continue;
                }

                // Check for position
                if (/^\d+$/.test(arg) && !targetPosition) {
                    targetPosition = parseInt(arg);
                    continue;
                }

                // Check for category by ID
                if (/^\d{17,19}$/.test(arg) && !targetCategory) {
                    const category = message.guild.channels.cache.get(arg);
                    if (category && category.type === ChannelType.GuildCategory) {
                        targetCategory = category;
                        continue;
                    }
                }

                // Skip common words
                if (skipWords.includes(lowerArg)) {
                    continue;
                }

                // Try to find category by name if we don't have one yet
                if (!targetCategory) {
                    const category = message.guild.channels.cache.find(c =>
                        c.type === ChannelType.GuildCategory &&
                        c.name.toLowerCase() === lowerArg
                    );
                    if (category) {
                        targetCategory = category;
                        continue;
                    }
                }

                // Add to channel name
                nameWords.push(arg);
            }

            if (nameWords.length > 0) {
                channelName = nameWords.join('-').toLowerCase();
            }
        }

        // Validate channel name
        if (!channelName) {
            return message.reply('❌ Please specify a name for the new channel.');
        }

        // Create channel
        try {
            const channelOptions = {
                name: channelName,
                type: channelType
            };

            if (targetCategory) {
                channelOptions.parent = targetCategory.id;
            }

            if (targetPosition !== null) {
                channelOptions.position = targetPosition;
            }

            const newChannel = await message.guild.channels.create(channelOptions);

            await message.react('<a:tickloop:926319357288648784>');

            let response = `✅ Successfully created ${channelType === ChannelType.GuildVoice ? 'voice' : 'text'} channel ${newChannel}`;
            if (targetCategory) {
                response += ` in category **${targetCategory.name}**`;
            }
            if (targetPosition !== null) {
                response += ` at position **${targetPosition}**`;
            }
            response += '.';

            return message.reply(response);
        } catch (error) {
            console.error('Error creating channel:', error);
            return message.reply('❌ There was an error trying to create the channel. Please try again.');
        }
    },
};