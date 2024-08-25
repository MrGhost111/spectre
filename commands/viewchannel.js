const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const dataPath = './data/channels.json';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('channelinfo')
        .setDescription('View channel information by providing a channel mention or user mention.')
        .addStringOption(option =>
            option.setName('target')
                .setDescription('The channel mention or user mention')
                .setRequired(true)),
    async execute(interaction) {
        const channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        const target = interaction.options.getString('target');

        // Extract channel ID or user ID from the mention
        const mentionMatch = target.match(/^<#(\d+)>$|^<@!?(\d+)>$/);
        if (!mentionMatch) {
            await interaction.reply({ content: 'Invalid mention format. Please provide a valid channel or user mention.', ephemeral: true });
            return;
        }

        const channelId = mentionMatch[1];
        const userId = mentionMatch[2];

        let targetChannel;
        if (channelId) {
            // Fetch channel information by channel ID
            targetChannel = Object.values(channelsData).find(ch => ch.channelId === channelId);
        } else if (userId) {
            // Fetch channel information by user ID
            targetChannel = channelsData[userId];
        }

        if (!targetChannel) {
            await interaction.reply({ content: 'No channel information found for the given mention.', ephemeral: true });
            return;
        }

        const channel = interaction.guild.channels.cache.get(targetChannel.channelId);
        if (!channel) {
            await interaction.reply({ content: 'Channel not found.', ephemeral: true });
            return;
        }

        // Fetch and display friends
        const friends = targetChannel.friends || [];
        const friendMentions = friends.length > 0 ? friends.map(id => `<@${id}>`).join('\n') : 'None';

        const embed = new EmbedBuilder()
            .setTitle(`Channel Info`)
            .setDescription(`**Channel Name:** ${channel.name}\n**Channel ID:** ${channel.id}`)
            .addFields(
                { name: 'Friends:', value: friendMentions }
            )
            .setColor(0x6666ff);

        await interaction.reply({ embeds: [embed] });
    },
};
