const { Events } = require('discord.js');
const { handleLanguageSelection } = require('../functions/wos/Settings/language');
const { handleChangeLanguageButton } = require('../functions/wos/Settings/language');

const WOS_COMMANDS = new Set(['panel', 'inspect']);

module.exports = {
    name: Events.InteractionCreate,
    async execute(client, interaction) {
        try {
            if (interaction.isAutocomplete()) {
                if (!WOS_COMMANDS.has(interaction.commandName)) return;
                const command = client.commands?.get(interaction.commandName);
                if (command?.autocomplete) {
                    try {
                        await command.autocomplete(interaction);
                    } catch (e) {
                        console.error(`[WOS] Autocomplete error for ${interaction.commandName}:`, e);
                    }
                }
                return;
            }

            // Handle select menus
            if (interaction.isStringSelectMenu()) {
                const customId = interaction.customId;

                if (customId.startsWith('language_select_')) {
                    await handleLanguageSelection(interaction);
                    return;
                }

                // add other select menus here as needed
                return;
            }

            // Handle buttons
            if (interaction.isButton()) {
                const customId = interaction.customId;

                if (customId.startsWith('change_language_')) {
                    await handleChangeLanguageButton(interaction);
                    return;
                }

                // add other buttons here as needed
                return;
            }

            if (!interaction.isChatInputCommand()) return;
            if (!WOS_COMMANDS.has(interaction.commandName)) return;

            const command = client.commands?.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`[WOS] Error executing ${interaction.commandName}:`, error);
                const reply = { content: 'An error occurred.', ephemeral: true };
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(reply).catch(() => { });
                } else {
                    await interaction.reply(reply).catch(() => { });
                }
            }

        } catch (err) {
            console.error('[WOS] Unhandled error in wos_interactionCreate:', err);
        }
    }
};