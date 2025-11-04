// JavaScript source code
const { EmbedBuilder } = require('discord.js');
const aiCodeExecutor = require('../utils/aiCodeExecutor');

module.exports = {
    name: 'interactionCreate',
    async execute(client, interaction) {
        // Handle button interactions for AI code execution confirmations
        if (interaction.isButton()) {
            const customId = interaction.customId;

            // Check if it's a confirmation button
            if (customId.startsWith('confirm_') || customId.startsWith('cancel_')) {
                const confirmed = customId.startsWith('confirm_');

                try {
                    const result = await aiCodeExecutor.handleConfirmation(interaction, confirmed);

                    if (result.cancelled) {
                        return; // Already handled in handleConfirmation
                    }

                    if (result.success) {
                        // Create detailed result embed
                        const resultEmbed = new EmbedBuilder()
                            .setColor('#9b59b6') // Purple color
                            .setTitle(result.result?.success ? '✅ Confirmed & Executed' : '❌ Execution Failed')
                            .setDescription(result.result?.message || 'Operation completed')
                            .setTimestamp();

                        if (result.intent && result.intent.targetName) {
                            resultEmbed.addFields({
                                name: '🎯 Target',
                                value: result.intent.targetName,
                                inline: true
                            });
                        }

                        if (result.result?.action) {
                            resultEmbed.addFields({
                                name: '⚡ Action',
                                value: result.result.action.replace(/_/g, ' '),
                                inline: true
                            });
                        }

                        await interaction.editReply({ embeds: [resultEmbed], components: [] });
                    } else {
                        // Execution failed
                        const errorEmbed = new EmbedBuilder()
                            .setColor('#ff0000')
                            .setTitle('❌ Execution Failed')
                            .setDescription(result.error || 'Unknown error occurred')
                            .setTimestamp();

                        if (result.issues) {
                            errorEmbed.addFields({
                                name: 'Security Issues',
                                value: result.issues.join('\n').slice(0, 1000)
                            });
                        }

                        if (result.generatedCode) {
                            errorEmbed.addFields({
                                name: 'Generated Code',
                                value: `\`\`\`javascript\n${result.generatedCode.slice(0, 400)}\n\`\`\``
                            });
                        }

                        await interaction.editReply({ embeds: [errorEmbed], components: [] });
                    }
                } catch (error) {
                    console.error('Error handling confirmation:', error);
                    await interaction.reply({
                        content: `❌ Error: ${error.message}`,
                        ephemeral: true
                    }).catch(() => { });
                }
            }
        }
    }
};