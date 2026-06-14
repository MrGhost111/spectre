// wos_interactionCreate.js
const { Events } = require('discord.js');
const WOS_COMMANDS = new Set(['panel', 'inspect']);

module.exports = {
    name: Events.InteractionCreate,
    async execute(client, interaction) {
        try {
            if (interaction.isAutocomplete()) {
                console.log(`[DEBUG] Autocomplete fired for: ${interaction.commandName}`); // <-- here
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