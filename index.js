const { Client, GatewayIntentBits, Collection, ActivityType } = require('discord.js');
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

// Simple console logging function
function logToConsole(message, isError = false) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] ${isError ? '❌ ERROR: ' : '📝 INFO: '}${message}`;
    
    if (isError) {
        console.error(formattedMessage);
    } else {
        console.log(formattedMessage);
    }
}

// Collections and Maps
client.commands = new Collection();
client.textCommands = new Collection();
client.snipedMessages = new Collection();
client.editedMessages = new Collection();
client.itemPrices = new Map();
client.prefix = ',';
client.logToConsole = logToConsole; // Add logging function to client

// Load commands
const loadCommands = async () => {
    try {
        const textCommandFiles = fs.readdirSync('./text-commands').filter(file => file.endsWith('.js'));
        for (const file of textCommandFiles) {
            try {
                const command = require(`./text-commands/${file}`);
                if (command.name) {
                    client.textCommands.set(command.name, command);
                    logToConsole(`Loaded text command: ${command.name}`);
                }
                if (command.aliases?.length) {
                    command.aliases.forEach(alias => {
                        client.textCommands.set(alias, command);
                    });
                }
            } catch (error) {
                logToConsole(`Failed to load text command file ${file}: ${error.message}`, true);
            }
        }

        const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            try {
                const command = require(`./commands/${file}`);
                if (command.data && command.data.name) {
                    client.commands.set(command.data.name, command);
                    logToConsole(`Loaded slash command: ${command.data.name}`);
                }
            } catch (error) {
                logToConsole(`Failed to load slash command file ${file}: ${error.message}`, true);
            }
        }
    } catch (error) {
        logToConsole(`Critical error loading commands: ${error.message}`, true);
    }
};

// Load events
const loadEvents = async () => {
    try {
        const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
        for (const file of eventFiles) {
            try {
                const event = require(`./events/${file}`);
                if (event.once) {
                    client.once(event.name, (...args) => event.execute(client, ...args));
                } else {
                    client.on(event.name, (...args) => event.execute(client, ...args));
                }
                logToConsole(`Loaded event: ${event.name}`);
            } catch (error) {
                logToConsole(`Failed to load event file ${file}: ${error.message}`, true);
            }
        }
    } catch (error) {
        logToConsole(`Critical error loading events: ${error.message}`, true);
    }
};

// Initialize ChatHandler
const initializeChatHandler = async () => {
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            logToConsole('OpenAI API key not found in environment variables. ChatHandler initialization failed.', true);
            return false;
        }

        const chatHandler = require('./utils/chatHandler').initialize(apiKey);
        logToConsole('ChatHandler initialized successfully');
        return true;
    } catch (error) {
        logToConsole(`Failed to initialize ChatHandler: ${error.message}`, true);
        return false;
    }
};

// Client ready handler
client.once('ready', async () => {
    logToConsole(`Logged in as ${client.user.tag}!`);

    client.user.setStatus('idle');
    client.user.setActivity('your DMs', { type: ActivityType.Listening });

    await loadCommands();
    await loadEvents();

    client.muteManager = new MuteManager(client);
    logToConsole('Mute Manager initialized');

    const chatHandlerInitialized = await initializeChatHandler();
    setupWeeklyCronJobs();

    logToConsole(`Bot startup complete. ChatHandler initialized: ${chatHandlerInitialized}`);
});

// Setup weekly cron jobs
function setupWeeklyCronJobs() {
    try {
        const { weeklyReset } = require('./events/mupdate.js');
        const { weeklyChannelCheck } = require('./utils/autoch.js');

        cron.schedule('0 0 * * 0', async () => {
            logToConsole('Weekly reset triggered at: ' + new Date().toISOString());
            try {
                const resetSuccess = await weeklyReset(client);
                logToConsole(resetSuccess ? 'Weekly reset completed successfully' : 'Weekly reset completed with errors');

                const logChannelId = '843413781409169412';
                const checkResults = await weeklyChannelCheck(client, logChannelId);
                logToConsole(`Channel check completed: ${checkResults.channelsChecked} channels checked, ${checkResults.friendsRemoved} friends removed`);
            } catch (error) {
                logToConsole(`Unhandled error during weekly processes: ${error.message}`, true);
            }
        }, {
            timezone: "UTC",
            scheduled: true,
            runOnInit: false
        });

        logToConsole('Weekly reset and channel check schedules set up successfully');
    } catch (error) {
        logToConsole(`Failed to set up cron jobs: ${error.message}`, true);
    }
}

// Error handling
process.on('unhandledRejection', (error) => {
    logToConsole(`Unhandled promise rejection: ${error.message}`, true);
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    logToConsole(`Uncaught exception: ${error.message}`, true);
    console.error('Uncaught exception:', error);
});

// Login
client.login(process.env.DISCORD_TOKEN).catch((error) => {
    console.error('Failed to login:', error);
});

module.exports = client;
