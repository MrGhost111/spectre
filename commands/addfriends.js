const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, Colors } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../data/channels.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addfriends')
        .setDescription('Add friends to your channel')
        .addUserOption(option => option.setName('friend1').setDescription('First friend to add').setRequired(true))
        .addUserOption(option => option.setName('friend2').setDescription('Second friend to add'))
        .addUserOption(option => option.setName('friend3').setDescription('Third friend to add'))
        .addUserOption(option => option.setName('friend4').setDescription('Fourth friend to add'))
        .addUserOption(option => option.setName('friend5').setDescription('Fifth friend to add')),
    async execute(interaction) {
        const responses = [];
        const addedUsers = [];

        // Load the channels data
        let channelsData = {};
        if (fs.existsSync(dataPath)) {
            channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        }

        // Find user's channel
        const userChannel = channelsData[interaction.user.id];
        if (!userChannel) {
            await interaction.reply({ content: "You don't own a channel.", ephemeral: true });
            return;
        }

        const channel = interaction.guild.channels.cache.get(userChannel.channelId);
        if (!channel) {
            await interaction.reply({ content: "Channel not found.", ephemeral: true });
            return;
        }

        // Collect friends from options
        const userOptions = [
            interaction.options.getUser('friend1'),
            interaction.options.getUser('friend2'),
            interaction.options.getUser('friend3'),
            interaction.options.getUser('friend4'),
            interaction.options.getUser('friend5')
        ].filter(user => user !== null);

        // Calculate the max friends limit
        const maxFriends = calculateMaxFriends(interaction.member);

        // Check if adding these users would exceed the limit
        if (userChannel.friends.length + userOptions.length > maxFriends) {
            await interaction.reply({ content: `You have exceeded your friend limit of ${maxFriends}.`, ephemeral: true });
            return;
        }

        // Process each user
        for (const user of userOptions) {
            if (user.bot) {
                responses.push(`You cannot add bots.`);
                continue;
            }

            if (interaction.user.id === user.id) {
                responses.push(`You cannot add yourself.`);
                continue;
            }

            if (!userChannel.friends) {
                userChannel.friends = [];
            }

            if (userChannel.friends.includes(user.id)) {
                if (channel.permissionOverwrites.cache.has(user.id)) {
                    responses.push(`<@${user.id}> is already in the channel.`);
                } else {
                    try {
                        await channel.permissionOverwrites.create(user.id, {
                            [PermissionsBitField.Flags.ViewChannel]: true,
                        });
                        addedUsers.push(user.id);
                        responses.push(`Added <@${user.id}>.`);
                    } catch (error) {
                        console.error('Error creating permission overwrite:', error);
                        responses.push(`Failed to add <@${user.id}>.`);
                    }
                }
            } else {
                userChannel.friends.push(user.id);
                try {
                    await channel.permissionOverwrites.create(user.id, {
                        [PermissionsBitField.Flags.ViewChannel]: true,
                    });
                    addedUsers.push(user.id);
                    responses.push(`Added <@${user.id}>.`);
                } catch (error) {
                    console.error('Error creating permission overwrite:', error);
                    responses.push(`Failed to add user <@${user.id}> to the channel.`);
                }
            }
        }

        // Ensure all friends in the list are in the channel
        for (const friendId of userChannel.friends) {
            if (!channel.permissionOverwrites.cache.has(friendId)) {
                try {
                    await channel.permissionOverwrites.create(friendId, {
                        [PermissionsBitField.Flags.ViewChannel]: true,
                    });
                    responses.push(`Added <@${friendId}>.`);
                } catch (error) {
                    console.error('Error creating permission overwrite:', error);
                    responses.push(`Failed to add user <@${friendId}> to the channel.`);
                }
            }
        }

        // Save updated data to JSON file
        channelsData[interaction.user.id] = userChannel;
        fs.writeFileSync(dataPath, JSON.stringify(channelsData, null, 2), 'utf8');

        // Create embed with valid description
        const embed = new EmbedBuilder()
            .setTitle('Add Friends')
            .setDescription(responses.length > 0 ? responses.join('\n') : 'No changes made.')
            .setColor(Colors.Green);

        await interaction.reply({ embeds: [embed] });
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
    };
    let totalLimit = 0;
    for (const roleId in roleLimits) {
        if (member.roles.cache.has(roleId)) {
            totalLimit += roleLimits[roleId];
        }
    }
    return totalLimit;
}
