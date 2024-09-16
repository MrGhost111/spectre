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
        } else if (interaction.isButton()) {
            console.log(`Button Interaction Detected: ${interaction.customId}`); // Debugging log

            // Check if it's the delete_snipe or delete_esnipe button
            if (interaction.customId === 'delete_snipe' || interaction.customId === 'delete_esnipe') {
                const message = interaction.message;
                const originalAuthorId = message.interaction.user.id; // The user who ran the original command

                // Check if the interaction user is the same as the command user
                if (interaction.user.id !== originalAuthorId) {
                    console.log(`Unauthorized delete attempt by ${interaction.user.tag}`);
                    return await interaction.reply({
                        content: 'You are not allowed to delete this message.',
                        ephemeral: true
                    });
                }

                try {
                    // Check if the message (embed) exists
                    if (message) {
                        console.log('Embed message found. Deleting...'); // Debugging log

                        // Delete the embed message
                        await message.delete();
                        console.log('Embed message deleted.');
                    } else {
                        console.log('No embed message found to delete.'); // Log if no embed found
                    }

                    // Find and delete the original command message (snipe or esnipe)
                    const originalCommandMessage = await interaction.channel.messages.fetch({ limit: 100 }).then(messages => {
                        return messages.find(msg => 
                            msg.content.startsWith(',snipe') || 
                            msg.content.startsWith(',esnipe')
                        );
                    });

                    // If the original command message exists, delete it
                    if (originalCommandMessage) {
                        console.log('Original command message found. Deleting...'); // Debugging log
                        await originalCommandMessage.delete();
                        console.log('Original command message deleted.');
                    } else {
                        console.log('Original command message was not found, likely already deleted or edited.'); // Graceful log
                    }

                    // Send an ephemeral reply to confirm deletion
                    await interaction.reply({ content: 'Deleted the snipe/esnipe message and the command.', ephemeral: true });
                } catch (error) {
                    console.error(`Error deleting message: ${error}`);
                    await interaction.reply({ content: 'Failed to delete the message.', ephemeral: true });
                }
            }
        }
    },
};
