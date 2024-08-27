const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
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
client.textCommands = new Collection();

// Load slash command files
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if (command.data && command.data.name) {
        client.commands.set(command.data.name, command);
    }
}

// Load text command files
const textCommandFiles = fs.readdirSync('./text-commands').filter(file => file.endsWith('.js'));

for (const file of textCommandFiles) {
    const command = require(`./text-commands/${file}`);
    if (command.name) {
        client.textCommands.set(command.name, command);
    }
}

client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) return;

        try {
            await command.execute(interaction);
            console.log(`${interaction.commandName} command executed`);
        } catch (error) {
            console.error(`Error executing ${interaction.commandName}:`, error);
            await interaction.reply('There was an error trying to execute that command!');
        }
    } else if (interaction.isButton() || interaction.isModalSubmit()) {
        await myChannelHandler.handleInteraction(interaction);
    }
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.textCommands.get(commandName);

    if (!command) return;

    try {
        await command.execute(message, args);
        console.log(`${commandName} text command executed`);
    } catch (error) {
        console.error(`Error executing ${commandName}:`, error);
        message.reply('There was an error trying to execute that command!');
    }
});

client.login(process.env.DISCORD_TOKEN);
