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

// Load existing items from items.json
const loadItems = () => {
    const filePath = path.join(__dirname, 'data', 'items.json');
    if (fs.existsSync(filePath)) {
        const rawData = fs.readFileSync(filePath, 'utf8');
        const items = JSON.parse(rawData);
        for (const [itemName, itemPrice] of Object.entries(items)) {
            client.itemPrices.set(itemName, itemPrice);
        }
    }
};

// Function to save items to items.json
const saveItems = () => {
    const filePath = path.join(__dirname, 'data', 'items.json');
    const items = Object.fromEntries(client.itemPrices);
    fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf8');
};

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
        loadItems();
        loadCommands();
        loadEvents();

        // Schedule weekly reset (Sunday at 12 AM EST)
        schedule.scheduleJob('0 0 * * 0', async () => {
            const moneyMakerEvent = require('./events/mupdate.js');
            if (moneyMakerEvent.processWeeklyReset) {
                await moneyMakerEvent.processWeeklyReset(client);
            }
        });

        // Log successful initialization
        console.log(`Logged in as ${client.user.tag}!`);
    } catch (error) {
        console.error('Error during initialization:', error);
    }
};

client.once('ready', initialize);

// Start the bot
client.login(process.env.DISCORD_TOKEN);

// Export client for other modules
module.exports = { client };
