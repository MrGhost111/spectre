const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const MuteManager = require('./utils/muteManager');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

// Collections and Maps
client.commands = new Collection();
client.textCommands = new Collection();
client.snipedMessages = new Collection();
client.editedMessages = new Collection();
client.itemPrices = new Map();
client.donations = new Map();

// Load commands
const loadCommands = () => {
    // Load text commands
    const textCommandFiles = fs.readdirSync('./text-commands').filter(file => file.endsWith('.js'));
    for (const file of textCommandFiles) {
        const command = require(`./text-commands/${file}`);
        if (command.name) {
            client.textCommands.set(command.name, command);
        }
    }
    // Load slash commands
    const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(`./commands/${file}`);
        if (command.data && command.data.name) {
            client.commands.set(command.data.name, command);
        }
    }
};

// Load events
const loadEvents = () => {
    const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        const event = require(`./events/${file}`);
        if (event.once) {
            client.once(event.name, (...args) => event.execute(client, ...args));
        } else {
            client.on(event.name, (...args) => event.execute(client, ...args));
        }
    }
};

// Load commands and events before client is ready
loadCommands();
loadEvents();

// Set up client ready handler
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);

    // Initialize the MuteManager
    client.muteManager = new MuteManager(client);
    console.log('Mute Manager initialized successfully');

    const { weeklyReset } = require('./events/mupdate.js');

    // Schedule weekly reset for Sunday at 00:00 UTC
    cron.schedule('0 0 * * 0', async () => {
        console.log('Weekly reset triggered at:', new Date().toISOString());
        try {
            await weeklyReset(client);
            console.log('Weekly reset completed successfully');
        } catch (error) {
            console.error('Error during weekly reset:', error);
        }
    }, {
        timezone: "UTC",
        scheduled: true,
        runOnInit: false
    });

    console.log('Weekly reset schedule set up successfully');
});

// Setup button interaction handler for risk button
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const { customId } = interaction;

    if (customId === 'risk') {
        await client.muteManager.handleRiskButton(interaction);
    }
    // Handle other buttons here...
});

// Login the client
client.login(process.env.DISCORD_TOKEN);

module.exports = client;