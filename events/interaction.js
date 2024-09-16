const { ButtonStyle, ActionRowBuilder, ButtonBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'interactionCreate',
    async execute(client, interaction) {
        if (interaction.isCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`Error executing command: ${error}`);
                await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
            }
        } else if (interaction.isButton() || interaction.isModalSubmit()) {
            const mycCommand = client.commands.get('mychannel');
            if (mycCommand && mycCommand.handleInteraction) {
                try {
                    await mycCommand.handleInteraction(interaction);
                    return;
                } catch (error) {
                    console.error(`Error handling interaction: ${error}`);
                    await interaction.reply({ content: 'There was an error handling this interaction!', ephemeral: true });
                }
            }
            const guessCommand = client.textCommands.get('guess');
            if (guessCommand && (interaction.customId === 'play_audio' || interaction.customId === 'submit_answer')) {
                try {
                    if (interaction.isModalSubmit()) {
                        await guessCommand.handleModalSubmit(interaction);
                    } else {
                        await guessCommand.handleInteraction(interaction);
                    }
                } catch (error) {
                    console.error(`Error handling guess interaction: ${error}`);
                    await interaction.reply({ content: 'There was an error handling this interaction!', ephemeral: true });
                }
            }
            if (interaction.customId === 'delete_esnipe') {
                const message = interaction.message;
                if (message) {
                    await message.delete();
                }
                await interaction.reply({ content: 'Deleted the snipe message.', ephemeral: true });
            }
        }
    },
};
