const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Send a message through the bot (Admin only)')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The message to send')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to send the message in (optional)')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        const isSpecificUser = interaction.user.id === '753491023208120321';

        if (!isAdmin && !isSpecificUser) {
            return interaction.editReply({ content: 'You do not have permission to use this command.' });
        }

        let message = interaction.options.getString('message');
        message = message.replace(/@(everyone|here|&\d+)/g, '@\u200b$1');

        const channel = interaction.options.getChannel('channel') || interaction.channel;

        try {
            await channel.send(message);
            await interaction.editReply({ content: `Message sent successfully in ${channel}!` });
        } catch (error) {
            await interaction.editReply({ content: 'Failed to send the message. Please check my permissions in the target channel.' });
        }
    }
};
