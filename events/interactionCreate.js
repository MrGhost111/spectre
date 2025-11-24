const spectreAI = require('../utils/spectreAI');

module.exports = {
    name: 'interactionCreate',
    async execute(client, interaction) {
        // Handle SpectreAI confirmation buttons
        if (interaction.isButton()) {
            const customId = interaction.customId;

            // Check if it's a SpectreAI confirmation button
            if (customId.startsWith('confirm_')) {
                const isConfirm = customId.endsWith('_confirm');
                const isCancel = customId.endsWith('_cancel');

                if (isConfirm || isCancel) {
                    await spectreAI.handleConfirmation(interaction, isConfirm);
                    return;
                }
            }
        }

        // Handle slash commands
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`Error executing ${interaction.commandName}`);
                console.error(error);

                const errorMessage = { content: 'There was an error while executing this command!', ephemeral: true };

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        }

        // Handle autocomplete interactions
        if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);

            if (!command || !command.autocomplete) {
                console.error(`No autocomplete handler for ${interaction.commandName} was found.`);
                return;
            }

            try {
                await command.autocomplete(interaction);
            } catch (error) {
                console.error(`Error handling autocomplete for ${interaction.commandName}`);
                console.error(error);
            }
        }
    },
};