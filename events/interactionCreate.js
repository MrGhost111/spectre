const spectreAI = require('../utils/spectreAI');

module.exports = {
    name: 'interactionCreate',
    async execute(client, interaction) {
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
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({
                        content: 'There was an error while executing this command!',
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content: 'There was an error while executing this command!',
                        ephemeral: true
                    });
                }
            }
        }

        // Handle Spectre AI confirmation buttons
        if (interaction.isButton()) {
            const customId = interaction.customId;

            console.log(`🔘 Button interaction received: ${customId}`);
            console.log(`🤖 SpectreAI instance: ${spectreAI.constructor.name}`);
            console.log(`📊 Pending confirmations count: ${spectreAI.pendingConfirmations.size}`);

            if (customId.startsWith('confirm_')) {
                const confirmed = customId.endsWith('_confirm');
                console.log(`✅ Processing confirmation (confirmed: ${confirmed})`);
                await spectreAI.handleConfirmation(interaction, confirmed);
            }
        }
    },
};