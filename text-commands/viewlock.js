// JavaScript source code
const { PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'viewlock',
    aliases: ['hideuser', 'blockview', 'restrictview'],
    description: 'Prevent a user from viewing a channel',
    async execute(message, args, entities = null) {
        // Check permissions
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply('❌ You do not have permission to manage channels.');
        }

        let targetUser = null;
        let targetChannel = null;

        // Priority 1: Use entities from AI parser if provided
        if (entities && entities.users && entities.users.length > 0) {
            targetUser = entities.users[0];
        }
        if (entities && entities.channels && entities.channels.length > 0) {
            targetChannel = entities.channels[0];
        }

        // Priority 2: Check mentions
        if (!targetUser) {
            targetUser = message.mentions.users.filter(u => !u.bot).first();
        }
        if (!targetChannel) {
            targetChannel = message.mentions.channels.first();
        }

        // Priority 3: Check if replying to someone for user
        if (!targetUser && message.reference) {
            try {
                const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                if (repliedMessage && !repliedMessage.author.bot) {
                    targetUser = repliedMessage.author;
                }
            } catch (error) {
                console.error('Error fetching replied message:', error);
            }
        }

        // Priority 4: Parse args
        if ((!targetUser || !targetChannel) && args.length > 0) {
            const skipWords = ['from', 'in', 'the', 'to', 'viewlock', 'hide', 'block', 'restrict'];
            const filteredArgs = args.filter(arg => !skipWords.includes(arg.toLowerCase()));

            for (const arg of filteredArgs) {
                // Try to find channel by ID
                if (!targetChannel && /^\d{17,19}$/.test(arg)) {
                    const channel = message.guild.channels.cache.get(arg);
                    if (channel) {
                        targetChannel = channel;
                        continue;
                    }
                }

                // Try to find channel by name
                if (!targetChannel) {
                    const channel = message.guild.channels.cache.find(c =>
                        c.name.toLowerCase() === arg.toLowerCase() ||
                        c.name.toLowerCase().includes(arg.toLowerCase())
                    );
                    if (channel) {
                        targetChannel = channel;
                        continue;
                    }
                }

                // Try to find user by ID
                if (!targetUser && /^\d{17,19}$/.test(arg)) {
                    try {
                        const member = await message.guild.members.fetch(arg);
                        if (member && !member.user.bot) {
                            targetUser = member.user;
                            continue;
                        }
                    } catch (error) {
                        console.error(`Failed to fetch user by ID ${arg}`);
                    }
                }

                // Try to find user by username
                if (!targetUser) {
                    const member = message.guild.members.cache.find(m =>
                        (m.user.username.toLowerCase() === arg.toLowerCase() ||
                            m.displayName.toLowerCase() === arg.toLowerCase()) &&
                        !m.user.bot
                    );
                    if (member) {
                        targetUser = member.user;
                    }
                }
            }
        }

        // Default to current channel if not specified
        if (!targetChannel) {
            targetChannel = message.channel;
        }

        // Validate we have a user
        if (!targetUser) {
            return message.reply('❌ Please specify a valid user to viewlock.');
        }

        // Get member object
        const targetMember = message.guild.members.cache.get(targetUser.id);
        if (!targetMember) {
            return message.reply('❌ User not found in this server.');
        }

        // Apply viewlock
        try {
            await targetChannel.permissionOverwrites.edit(targetUser.id, {
                [PermissionsBitField.Flags.ViewChannel]: false
            });

            await message.react('<a:tickloop:926319357288648784>');
            return message.reply(`✅ Successfully viewlocked **${targetUser.username}** from **${targetChannel.name}**.`);
        } catch (error) {
            console.error('Error applying viewlock:', error);
            return message.reply('❌ There was an error trying to viewlock the user. Please try again.');
        }
    },
};