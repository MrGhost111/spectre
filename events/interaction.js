const { ButtonStyle, ActionRowBuilder, ButtonBuilder, EmbedBuilder } = require('discord.js');
const path = require('path');

// Importing the mychannel command
const myChannelCommand = require(path.join(__dirname, '../commands/myc.js'));

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
        } else if (interaction.isButton()) {
            console.log(`Button Interaction Detected: ${interaction.customId}`); // Debugging log

            // Check if it's the delete_snipe or delete_esnipe button
            if (interaction.customId === 'delete_snipe' || interaction.customId === 'delete_esnipe') {
                // Handle snipe/esnipe buttons
                const message = interaction.message;
                const originalAuthorId = message.interaction.user.id; // The user who ran the original command

                if (interaction.user.id !== originalAuthorId) {
                    console.log(`Unauthorized delete attempt by ${interaction.user.tag}`);
                    return await interaction.reply({
                        content: 'You are not allowed to delete this message.',
                        ephemeral: true
                    });
                }

                try {
                    if (message) {
                        console.log('Embed message found. Deleting...');
                        await message.delete();
                        console.log('Embed message deleted.');
                    }

                    const originalCommandMessage = await interaction.channel.messages.fetch({ limit: 100 }).then(messages => {
                        return messages.find(msg => 
                            msg.content.startsWith(',snipe') || 
                            msg.content.startsWith(',esnipe')
                        );
                    });

                    if (originalCommandMessage) {
                        console.log('Original command message found. Deleting...');
                        await originalCommandMessage.delete();
                        console.log('Original command message deleted.');
                    }

                    await interaction.reply({ content: 'Deleted the snipe/esnipe message and the command.', ephemeral: true });
                } catch (error) {
                    console.error(`Error deleting message: ${error}`);
                    await interaction.reply({ content: 'Failed to delete the message.', ephemeral: true });
                }
            } 

            // Add handling for buttons related to mychannel command
            else if (interaction.customId === 'create_channel' || interaction.customId === 'rename_channel' || interaction.customId === 'view_friends') {
                try {
                    await myChannelCommand.handleInteraction(interaction);
                } catch (error) {
                    console.error(`Error handling mychannel interaction: ${error}`);
                    await interaction.reply({ content: 'There was an error handling your interaction!', ephemeral: true });
                }
            }
        }
    },
};

