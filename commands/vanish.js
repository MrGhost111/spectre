const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vanish')
        .setDescription('Deletes a message by ID (Owner only)')
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('The ID of the message to delete')
                .setRequired(true)),
    async execute(interaction) {
        // Check if the command is being used by the owner
        if (interaction.user.id !== '753491023208120321') {
            return interaction.reply({
                content: 'This command is restricted to the bot owner only.',
                ephemeral: true
            });
        }

        const messageId = interaction.options.getString('message_id');

        try {
            // Defer the reply as ephemeral immediately
            await interaction.deferReply({ ephemeral: true });

            // Get the channel where the command was used
            const channel = interaction.channel;

            // Attempt to fetch and delete the target message
            const targetMessage = await channel.messages.fetch(messageId).catch(() => null);

            if (!targetMessage) {
                return interaction.editReply({
                    content: 'Unable to find message with that ID in this channel.',
                    ephemeral: true
                });
            }

            await targetMessage.delete();

            // Send a confirmation that only the command user can see
            return interaction.editReply({
                content: `Message ${messageId} has been deleted.`,
                ephemeral: true
            });
        } catch (error) {
            return interaction.editReply({
                content: `Error: ${error.message}`,
                ephemeral: true
            });
        }
    }
};