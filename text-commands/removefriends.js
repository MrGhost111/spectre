// JavaScript source code
const { EmbedBuilder, PermissionsBitField, Colors } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../data/channels.json');

module.exports = {
    name: 'removefriends',
    aliases: ['removechannel', 'removevc', 'removepeople', 'removefriend', 'kickfriend'],
    description: 'Remove friends from your donor voice channel',
    async execute(message, args) {
        const responses = [];
        const removedUsers = [];

        // Load the channels data
        let channelsData = {};
        if (fs.existsSync(dataPath)) {
            channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        }

        // Find user's channel
        const userChannel = channelsData[message.author.id];
        if (!userChannel) {
            return message.reply("You don't own a channel.");
        }

        const channel = message.guild.channels.cache.get(userChannel.channelId);
        if (!channel) {
            return message.reply("Channel not found.");
        }

        // Collect users to remove with priority-based detection
        const usersToRemove = [];

        // Priority 1: Get mentioned users
        if (message.mentions.users.size > 0) {
            message.mentions.users.forEach(user => {
                if (!user.bot && user.id !== message.author.id) {
                    usersToRemove.push(user);
                }
            });
        }

        // Priority 2: Check if replying to someone (remove them if no mentions)
        if (usersToRemove.length === 0 && message.reference) {
            try {
                const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                if (repliedMessage && !repliedMessage.author.bot && repliedMessage.author.id !== message.author.id) {
                    usersToRemove.push(repliedMessage.author);
                }
            } catch (error) {
                console.error('Error fetching replied message:', error);
            }
        }

        // Priority 3: Parse args for usernames/IDs (if no mentions and no reply)
        if (usersToRemove.length === 0 && args.length > 0) {
            // Filter out common words
            const commonWords = ['from', 'my', 'channel', 'vc', 'and', 'the', 'in'];
            const filteredArgs = args.filter(arg => !commonWords.includes(arg.toLowerCase()));

            for (const arg of filteredArgs) {
                // Try to find by ID
                if (/^\d{17,19}$/.test(arg)) {
                    try {
                        const member = await message.guild.members.fetch(arg);
                        if (member && !member.user.bot && member.id !== message.author.id) {
                            usersToRemove.push(member.user);
                        }
                    } catch (error) {
                        console.error(`Failed to fetch user by ID ${arg}:`, error);
                    }
                }
                // Try to find by username or display name
                else {
                    const member = message.guild.members.cache.find(m =>
                        (m.user.username.toLowerCase() === arg.toLowerCase() ||
                            m.displayName.toLowerCase() === arg.toLowerCase()) &&
                        !m.user.bot &&
                        m.id !== message.author.id
                    );
                    if (member) {
                        usersToRemove.push(member.user);
                    }
                }
            }
        }

        // Check if any users were found
        if (usersToRemove.length === 0) {
            return message.reply("Please mention users or provide their usernames/IDs to remove from your channel.");
        }

        // Initialize friends array if it doesn't exist
        if (!userChannel.friends) {
            userChannel.friends = [];
        }

        // Process each user
        for (const user of usersToRemove) {
            // Check if user is in the friends list
            if (!userChannel.friends.includes(user.id)) {
                responses.push(`⚠️ <@${user.id}> is not in your friends list.`);
                continue;
            }

            // Remove the user from the friends list
            userChannel.friends = userChannel.friends.filter(friendId => friendId !== user.id);

            // Remove permission overwrites
            const permissionOverwrite = channel.permissionOverwrites.cache.get(user.id);
            if (permissionOverwrite) {
                try {
                    await permissionOverwrite.delete();
                    removedUsers.push(user.id);
                    responses.push(`✅ Removed <@${user.id}> from the channel.`);
                } catch (error) {
                    console.error('Error removing permission overwrite:', error);
                    responses.push(`❌ Failed to remove <@${user.id}> from the channel.`);
                    // Re-add to friends list if permission removal failed
                    userChannel.friends.push(user.id);
                }
            } else {
                responses.push(`✅ Removed <@${user.id}> from friends list (was not in channel).`);
            }
        }

        // Save updated data to JSON file
        channelsData[message.author.id] = userChannel;
        fs.writeFileSync(dataPath, JSON.stringify(channelsData, null, 2), 'utf8');

        // Calculate max friends for display
        const maxFriends = calculateMaxFriends(message.member);
        const currentFriends = userChannel.friends.length;
        responses.push(`\n📊 Channel usage: ${currentFriends}/${maxFriends} friends`);

        // Create embed with valid description
        const embed = new EmbedBuilder()
            .setTitle('Remove Friends from Channel')
            .setDescription(responses.length > 0 ? responses.join('\n') : 'No changes made.')
            .setColor(removedUsers.length > 0 ? Colors.Red : Colors.Yellow)
            .setFooter({ text: `Channel: ${channel.name}` });

        return message.reply({ embeds: [embed] });
    },
};

// Helper function to calculate the maximum number of friends based on roles
function calculateMaxFriends(member) {
    const roleLimits = {
        '768448955804811274': 5,
        '768449168297033769': 5,
        '946729964328337408': 5,
        '1028256286560763984': 5,
        '1028256279124250624': 5,
        '1038106794200932512': 5,
        '1038888209440067604': 5,
        '783032959350734868': 10,
    };

    let totalLimit = 0;
    for (const roleId in roleLimits) {
        if (member.roles.cache.has(roleId)) {
            totalLimit += roleLimits[roleId];
        }
    }
    return totalLimit;
}