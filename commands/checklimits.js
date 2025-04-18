const { SlashCommandBuilder } = require('discord.js');
const { checkChannelLimits } = require('../utils/checkChannelLimits'); // Adjust the path as needed

// Authorized user IDs that can run this command without admin permissions
const authorizedUserIds = ['730401940311244880', '753491023208120321'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('checklimits')
        .setDescription('Check all channels for owners who left or exceed friend limits'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const isAdmin = interaction.member.permissions.has('ADMINISTRATOR'); // Using string permission name
        const isAuthorized = authorizedUserIds.includes(userId);

        // Check if the user has permission to run this command
        if (!isAdmin && !isAuthorized) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        // Defer the reply since this might take some time
        await interaction.deferReply({ ephemeral: true });

        try {
            // Execute the check function
            const result = await checkChannelLimits(interaction.client);

            if (result) {
                await interaction.editReply({
                    content: 'Channel limits check completed successfully. See the report channel for details.',
                    ephemeral: true
                });
            } else {
                await interaction.editReply({
                    content: 'An error occurred while checking channel limits. Check the console for details.',
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Error executing checkChannelLimits command:', error);
            await interaction.editReply({
                content: 'An error occurred while executing the command. Check the console for details.',
                ephemeral: true
            });
        }
    },
};