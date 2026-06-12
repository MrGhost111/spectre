// registerglobal.js - run once with: node registerglobal.js
const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const command = new SlashCommandBuilder()
    .setName('deploycmd')
    .setDescription('Deploy a slash command to this server (owner only)')
    .addStringOption(option =>
        option
            .setName('command')
            .setDescription('Command to deploy')
            .setRequired(true)
            .setAutocomplete(true)
    );

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Registering deploycmd globally...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: [command.toJSON()] }
        );
        console.log('Done! Note: global commands can take up to 1 hour to appear in all servers.');
    } catch (error) {
        console.error(error);
    }
})();
