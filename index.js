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

// Initialize snipedMessages and editedMessages
client.snipedMessages = new Collection();
client.editedMessages = new Collection();

client.commands = new Collection();
client.textCommands = new Collection();

// Load slash command files
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if (command.data && command.data.name) {
        client.commands.set(command.data.name, command);
        console.log(`Loaded command: ${command.data.name}`); // Debug log
    }
}

// Load text command files
const textCommandFiles = fs.readdirSync('./text-commands').filter(file => file.endsWith('.js'));

for (const file of textCommandFiles) {
    const command = require(`./text-commands/${file}`);
    if (command.name) {
        client.textCommands.set(command.name, command);
        console.log(`Loaded text command: ${command.name}`); // Debug log
    }
}

client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.log(`Command ${interaction.commandName} not found`); // Debug log
            return;
        }

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

    // Extract the command name from the message content
    const args = message.content.slice(1).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    // Find a command where the message starts with that command name
    const command = client.textCommands.find(cmd => commandName.startsWith(cmd.name));

    if (!command) return;

    try {
        await command.execute(message, args);
        console.log(`${command.name} text command executed`);
    } catch (error) {
        console.error(`Error executing ${command.name}:`, error);
        message.reply('There was an error trying to execute that command!');
    }
});

client.on(Events.MessageDelete, (message) => {
    if (message.author.bot) return;

    if (!client.snipedMessages.has(message.channel.id)) {
        client.snipedMessages.set(message.channel.id, []);
    }

    const snipedMessages = client.snipedMessages.get(message.channel.id);
    snipedMessages.push({
        content: message.content,
        author: message.author.username,
        timestamp: Math.floor(message.createdTimestamp / 1000), // Convert to Unix timestamp in seconds
    });

    // Keep only the last 100 sniped messages
    if (snipedMessages.length > 100) {
        snipedMessages.shift();
    }
});

client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
    if (oldMessage.author.bot || oldMessage.content === newMessage.content) return;

    if (!client.editedMessages.has(oldMessage.channel.id)) {
        client.editedMessages.set(oldMessage.channel.id, []);
    }

    const editedMessages = client.editedMessages.get(oldMessage.channel.id);
    editedMessages.push({
        oldContent: oldMessage.content,
        newContent: newMessage.content,
        author: oldMessage.author.username,
        timestamp: Math.floor(oldMessage.editedTimestamp / 1000), // Convert to Unix timestamp in seconds
    });

    // Keep only the last 100 edited messages
    if (editedMessages.length > 100) {
        editedMessages.shift();
    }
});

client.login(process.env.DISCORD_TOKEN);
