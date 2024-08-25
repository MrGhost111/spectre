const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, Colors } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../data/channels.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removefriends')
        .setDescription('Remove friends from your channel')
        .addUserOption(option => option.setName('friend1').setDescription('First friend to remove').setRequired(true))
        .addUserOption(option => option.setName('friend2').setDescription('Second friend to remove'))
        .addUserOption(option => option.setName('friend3').setDescription('Third friend to remove'))
        .addUserOption(option => option.setName('friend4').setDescription('Fourth friend to remove'))
        .addUserOption(option => option.setName('friend5').setDescription('Fifth friend to remove')),
    async execute(interaction) {
        const responses = [];

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

        // Process each user
        for (const user of userOptions) {
            if (user.bot) {
                responses.push(`You cannot remove bots.`);
                continue;
            }

            if (interaction.user.id === user.id) {
                responses.push(`You cannot remove yourself.`);
                continue;
            }

            if (!userChannel.friends || !userChannel.friends.includes(user.id)) {
                responses.push(`User <@${user.id}> is not in your friends list.`);
                continue;
            }

            // Remove the user from the friends list and permissions
            userChannel.friends = userChannel.friends.filter(friendId => friendId !== user.id);
            const permissionOverwrite = channel.permissionOverwrites.cache.get(user.id);
            if (permissionOverwrite) {
                await permissionOverwrite.delete();
                responses.push(`User <@${user.id}> removed from the channel.`);
            } else {
                responses.push(`User <@${user.id}> is not in the channel.`);
            }
        }

        // Save updated data to JSON file
        channelsData[interaction.user.id] = userChannel;
        fs.writeFileSync(dataPath, JSON.stringify(channelsData, null, 2), 'utf8');

        // Create embed with valid description
        const embed = new EmbedBuilder()
            .setTitle('Remove Friends')
            .setDescription(responses.length > 0 ? responses.join('\n') : 'No changes made.')
            .setColor(Colors.Red);

        await interaction.reply({ embeds: [embed] });
    },
};
