const { EmbedBuilder, PermissionsBitField, Colors } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../data/channels.json');

module.exports = {
    name: 'addfriends',
    aliases: ['addchannel', 'addvc', 'addpeople', 'addfriend'],
    description: 'Add friends to your donor voice channel',
    async execute(message, args) {
        const responses = [];
        const addedUsers = [];

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

        // Collect users to add with priority-based detection
        const usersToAdd = [];

        // Priority 1: Get mentioned users
        if (message.mentions.users.size > 0) {
            message.mentions.users.forEach(user => {
                if (!user.bot && user.id !== message.author.id) {
                    usersToAdd.push(user);
                }
            });
        }

        // Priority 2: Check if replying to someone (add them if no mentions)
        if (usersToAdd.length === 0 && message.reference) {
            try {
                const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                if (repliedMessage && !repliedMessage.author.bot && repliedMessage.author.id !== message.author.id) {
                    usersToAdd.push(repliedMessage.author);
                }
            } catch (error) {
                console.error('Error fetching replied message:', error);
            }
        }

        // Priority 3: Parse args for usernames/IDs (if no mentions and no reply)
        if (usersToAdd.length === 0 && args.length > 0) {
            // Filter out common words
            const commonWords = ['to', 'my', 'channel', 'vc', 'and', 'the', 'in'];
            const filteredArgs = args.filter(arg => !commonWords.includes(arg.toLowerCase()));

            for (const arg of filteredArgs) {
                // Try to find by ID
                if (/^\d{17,19}$/.test(arg)) {
                    try {
                        const member = await message.guild.members.fetch(arg);
                        if (member && !member.user.bot && member.id !== message.author.id) {
                            usersToAdd.push(member.user);
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
                        usersToAdd.push(member.user);
                    }
                }
            }
        }

        // Check if any users were found
        if (usersToAdd.length === 0) {
            return message.reply("Please mention users or provide their usernames/IDs to add to your channel.");
        }

        // Calculate the max friends limit
        const maxFriends = calculateMaxFriends(message.member);
        const currentFriends = userChannel.friends ? userChannel.friends.length : 0;
        const availableSlots = maxFriends - currentFriends;

        // Check if user has reached their limit
        if (availableSlots <= 0) {
            return message.reply(`You have reached your friend limit of ${maxFriends}. Remove some friends first.`);
        }

        // Limit users to available slots (prioritize first mentioned/found users)
        let usersToProcess = usersToAdd.slice(0, availableSlots);
        const skippedUsers = usersToAdd.slice(availableSlots);

        if (skippedUsers.length > 0) {
            responses.push(`⚠️ Only adding first ${availableSlots} user(s) due to limit (${availableSlots}/${maxFriends} slots available).`);
        }

        // Initialize friends array if it doesn't exist
        if (!userChannel.friends) {
            userChannel.friends = [];
        }

        // Process each user
        for (const user of usersToProcess) {
            // Check if user is already in friends list
            if (userChannel.friends.includes(user.id)) {
                // Check if they have permission overwrites
                if (channel.permissionOverwrites.cache.has(user.id)) {
                    responses.push(`<@${user.id}> is already in the channel.`);
                } else {
                    // Re-add permissions if they were removed
                    try {
                        await channel.permissionOverwrites.create(user.id, {
                            [PermissionsBitField.Flags.ViewChannel]: true,
                        });
                        addedUsers.push(user.id);
                        responses.push(`✅ Re-added <@${user.id}>.`);
                    } catch (error) {
                        console.error('Error creating permission overwrite:', error);
                        responses.push(`❌ Failed to add <@${user.id}>.`);
                    }
                }
            } else {
                // Add new friend
                userChannel.friends.push(user.id);
                try {
                    await channel.permissionOverwrites.create(user.id, {
                        [PermissionsBitField.Flags.ViewChannel]: true,
                    });
                    addedUsers.push(user.id);
                    responses.push(`✅ Added <@${user.id}>.`);
                } catch (error) {
                    console.error('Error creating permission overwrite:', error);
                    responses.push(`❌ Failed to add <@${user.id}>.`);
                    // Remove from friends list if permission creation failed
                    userChannel.friends = userChannel.friends.filter(id => id !== user.id);
                }
            }
        }

        // Save updated data to JSON file
        channelsData[message.author.id] = userChannel;
        fs.writeFileSync(dataPath, JSON.stringify(channelsData, null, 2), 'utf8');

        // Add info about skipped users if any
        if (skippedUsers.length > 0) {
            const skippedNames = skippedUsers.map(u => u.username).join(', ');
            responses.push(`\n⚠️ Skipped: ${skippedNames} (limit reached)`);
        }

        // Show current usage
        const newFriendCount = userChannel.friends.length;
        responses.push(`\n📊 Channel usage: ${newFriendCount}/${maxFriends} friends`);

        // Create embed with valid description
        const embed = new EmbedBuilder()
            .setTitle('Add Friends to Channel')
            .setDescription(responses.length > 0 ? responses.join('\n') : 'No changes made.')
            .setColor(addedUsers.length > 0 ? Colors.Green : Colors.Yellow)
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