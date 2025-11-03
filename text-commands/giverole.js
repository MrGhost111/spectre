// JavaScript source code
const { PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'giverole',
    aliases: ['addrole', 'assignrole', 'grantrole'],
    description: 'Give a role to a user',
    async execute(message, args, entities = null) {
        // Check permissions
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return message.reply('❌ You do not have permission to manage roles.');
        }

        let targetUser = null;
        let targetRole = null;

        // Priority 1: Use entities from AI parser if provided
        if (entities && entities.roles && entities.roles.length > 0) {
            targetRole = entities.roles[0];
        }
        if (entities && entities.users && entities.users.length > 0) {
            targetUser = entities.users[0];
        }

        // Priority 2: Check mentions if not found in entities
        if (!targetUser) {
            targetUser = message.mentions.users.filter(u => !u.bot).first();
        }
        if (!targetRole) {
            targetRole = message.mentions.roles.first();
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

        // Priority 4: Parse args for username/ID and role
        if ((!targetUser || !targetRole) && args.length > 0) {
            const skipWords = ['to', 'the', 'from', 'give', 'add', 'role', 'assign', 'grant'];
            const filteredArgs = args.filter(arg => !skipWords.includes(arg.toLowerCase()));

            for (const arg of filteredArgs) {
                // Try to find role first by ID or name
                if (!targetRole) {
                    let role = message.guild.roles.cache.get(arg);
                    if (!role) {
                        role = message.guild.roles.cache.find(r =>
                            r.name.toLowerCase() === arg.toLowerCase() ||
                            r.name.toLowerCase().includes(arg.toLowerCase())
                        );
                    }
                    if (role) {
                        targetRole = role;
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

        // Validate we have both user and role
        if (!targetRole) {
            return message.reply('❌ Please specify a valid role to give.');
        }
        if (!targetUser) {
            return message.reply('❌ Please specify a valid user to give the role to.');
        }

        // Get member object
        const targetMember = message.guild.members.cache.get(targetUser.id);
        if (!targetMember) {
            return message.reply('❌ User not found in this server.');
        }

        // Check if user already has the role
        if (targetMember.roles.cache.has(targetRole.id)) {
            return message.reply(`⚠️ ${targetUser.username} already has the ${targetRole.name} role.`);
        }

        // Check role hierarchy
        if (targetRole.position >= message.guild.members.me.roles.highest.position) {
            return message.reply('❌ I cannot assign this role as it is higher than or equal to my highest role.');
        }

        if (targetRole.position >= message.member.roles.highest.position) {
            return message.reply('❌ You cannot assign this role as it is higher than or equal to your highest role.');
        }

        // Give the role
        try {
            await targetMember.roles.add(targetRole);
            await message.react('<a:tickloop:926319357288648784>');
            return message.reply(`✅ Successfully gave **${targetRole.name}** to **${targetUser.username}**.`);
        } catch (error) {
            console.error('Error giving role:', error);
            return message.reply('❌ There was an error trying to give the role. Please try again.');
        }
    },
};