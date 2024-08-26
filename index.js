const { Client, GatewayIntentBits, Collection, Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType } = require('discord.js');
const fs = require('fs');
require('dotenv').config();
const myChannelHandler = require('./commands/myc.js'); // Import the command handler

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
    ],
});

client.commands = new Collection();

// Load command files
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`); // Corrected require statement
    if (command.data && command.data.name) {
        client.commands.set(command.data.name, command);
    }
}

client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}!`); // Corrected template literal
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) return;

        try {
            await command.execute(interaction);
            console.log(`${interaction.commandName} command executed`); // Corrected template literal
        } catch (error) {
            console.error(`Error executing ${interaction.commandName}:`, error); // Corrected template literal
            await interaction.reply('There was an error trying to execute that command!');
        }
    } else if (interaction.isButton() || interaction.isModalSubmit()) {
        // Call appropriate handler from myc.js
        await myChannelHandler.handleInteraction(interaction);
    }
});

client.login(process.env.DISCORD_TOKEN);
