const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
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

client.commands = new Collection();
client.textCommands = new Collection();
client.snipedMessages = new Collection();
client.editedMessages = new Collection();
client.itemPrices = new Map();
client.donations = new Map();

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

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

// Initialize donation tracking files
const initializeDonationFiles = () => {
    const usersFilePath = path.join(__dirname, 'data', 'users.json');
    const weeklyFilePath = path.join(__dirname, 'data', 'weekly_donations.json');

    if (!fs.existsSync(usersFilePath)) {
        fs.writeFileSync(usersFilePath, JSON.stringify({}, null, 2), 'utf8');
    }

    if (!fs.existsSync(weeklyFilePath)) {
        const initialWeeklyData = {
            currentWeek: new Date().toISOString().slice(0, 4) + '-W' + 
                        String(Math.ceil((new Date().getDate() + 
                        new Date(new Date().getFullYear(), new Date().getMonth(), 1).getDay()) / 7)).padStart(2, '0'),
            statusMessageId: "1327928823064563806",
            donations: {}
        };
        fs.writeFileSync(weeklyFilePath, JSON.stringify(initialWeeklyData, null, 2), 'utf8');
    }
};

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

// Register event handlers dynamically
const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
    const event = require(`./events/${file}`);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(client, ...args));
    } else {
        client.on(event.name, (...args) => event.execute(client, ...args));
    }
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    loadItems();
    initializeDonationFiles();
    
    // Initialize the weekly reset from mupdate.js
    try {
        const mupdateEvent = require('./events/mupdate.js');
        if (typeof mupdateEvent.execute === 'function') {
            const guild = client.guilds.cache.first();
            if (guild) {
                await mupdateEvent.execute(client, null, null);
                console.log('Weekly donation tracking initialized successfully');
            }
        }
    } catch (error) {
        console.error('Error initializing donation tracking:', error);
    }
});

// Error handling
client.on('error', error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

client.login(process.env.DISCORD_TOKEN);
