const { REST, Routes } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const token = process.env.DISCORD_TOKEN;
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Started refreshing guild application (/) commands.');

        const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
        const commands = [];

        for (const file of commandFiles) {
            try {
                const command = require(`./commands/${file}`);
                if (command.data) {
                    const commandData = typeof command.data.toJSON === 'function'
                        ? command.data.toJSON()
                        : command.data;
                    commands.push(commandData);
                }
            } catch (err) {
                console.warn(`⚠️  Skipped ${file}: ${err.message}`);
            }
        }

        const currentCommands = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
        for (const command of currentCommands) {
            if (!commands.some(c => c.name === command.name)) {
                console.log(`Deleting guild command: ${command.name} (${command.id})`);
                await rest.delete(Routes.applicationGuildCommand(clientId, guildId, command.id));
            }
        }

        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands }
        );

        console.log('Successfully reloaded guild application (/) commands.');
    } catch (error) {
        console.error('Error reloading commands:', error);
    }
})();
