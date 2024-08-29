const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('fs');
require('dotenv').config();
const myChannelHandler = require('./commands/myc.js'); // Import the command handler
const interactionHandler = require('./text-commands/interactionHandler.js'); // Import the interaction handler

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

client.commands = new Collection();
client.textCommands = new Collection();
client.snipedMessages = new Collection(); // Store sniped messages
client.editedMessages = new Collection(); // Store edited messages

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

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton() || interaction.isModalSubmit()) {
        await interactionHandler.handleInteraction(interaction);
    }
});

// Listen for message deletions and store the deleted messages
client.on(Events.MessageDelete, message => {
    if (!message.partial) {
        const snipedMessages = client.snipedMessages.get(message.channel.id) || [];
        snipedMessages.push({
            author: message.author,
            content: message.content,
            timestamp: message.createdTimestamp
        });
        client.snipedMessages.set(message.channel.id, snipedMessages);
    }
});

// Listen for message edits and store the edited messages
client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
    if (!oldMessage.partial && !newMessage.partial) {
        const editedMessages = client.editedMessages.get(oldMessage.channel.id) || [];
        editedMessages.push({
            author: oldMessage.author,
            oldContent: oldMessage.content,
            newContent: newMessage.content,
            timestamp: oldMessage.createdTimestamp
        });
        client.editedMessages.set(oldMessage.channel.id, editedMessages);
    }
});

client.login(process.env.DISCORD_TOKEN);
