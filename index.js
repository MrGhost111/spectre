const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');
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

// Initialize
const initialize = async () => {
    try {
        // Load all components
        loadCommands();
        loadEvents();
console.log('Setting up weekly reset schedule...');
const { weeklyReset } = require('./events/mupdate.js');
schedule.scheduleJob('0 0 * * 0', async () => {
    console.log('Weekly reset triggered by scheduler at:', new Date().toLocaleString());
    try {
        await weeklyReset(client);
        console.log('Weekly reset completed successfully');
    } catch (error) {
        console.error('Error during scheduled weekly reset:', error);
    }
});
        console.log(`Logged in as ${client.user.tag}!`);
    } catch (error) {
        console.error('Error during initialization:', error);
    }
};

client.once('ready', initialize);
client.login(process.env.DISCORD_TOKEN);

module.exports = client;
