// index.js
const { Client, GatewayIntentBits, Collection, ActivityType, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const MuteManager = require('./utils/muteManager');
require('dotenv').config();

const OpenAI = require('openai').default;

const LOG_CHANNEL_ID = '1349968940973166645';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
    ],
    partials: [Partials.Channel], // FIXED: Use Partials enum instead of string
});

// Simple logging function that logs to console
function logToConsole(message, isError = false) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] ${isError? '❌ ERROR: ' : '📝 INFO: '}${message}`;
    
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
client.prefix = ','; // Define your command prefix here
client.logToDiscord = logToConsole; // Use console logging instead

// Load commands
const loadCommands = () => {
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
const loadEvents = () => {
    try {
        const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
        for (const file of eventFiles) {
            try {
                const event = require(`./events/${file}`);
                if (event.once) {
                    client.once(event.name, (...args) => event.execute(client,...args));
                } else {
                    client.on(event.name, (...args) => event.execute(client,...args));
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

// Client ready handler
client.once('ready', () => {
    logToConsole(`Logged in as ${client.user.tag}!`);

    // Set the bot's status to idle
    client.user.setStatus('idle');
    client.user.setActivity('your DMs', { type: ActivityType.Listening });

    // Load commands and events
    loadCommands();
    loadEvents();

    // Initialize systems
    client.muteManager = new MuteManager(client);
    logToConsole('Mute Manager initialized');

    // Initialize OpenAI Client directly here
    try {
        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (!openaiApiKey) {
            logToConsole('OpenAI API key not found in environment variables. OpenAI client not initialized.', true);
        } else {
            client.openai = new OpenAI({
                apiKey: openaiApiKey,
                maxRetries: 3,
            });
            logToConsole('OpenAI client initialized successfully');
        }
    } catch (error) {
        logToConsole(`Failed to initialize OpenAI client: ${error.message}`, true);
    }

    // Setup cron job for weekly tasks
    setupWeeklyCronJobs();

    logToConsole(`Bot startup complete.`);
});

// Setup weekly cron jobs
function setupWeeklyCronJobs() {
    try {
        // Weekly reset and channel check schedule
        const { weeklyReset } = require('./events/mupdate.js');
        const { weeklyChannelCheck } = require('./utils/autoch.js');

        cron.schedule('0 0 * * 0', () => {
            logToConsole('Weekly reset triggered at: ' + new Date().toISOString());
            try {
                // Run the weekly reset
                weeklyReset(client)
                    .then(resetSuccess => {
                        logToConsole(resetSuccess ? 'Weekly reset completed successfully' : 'Weekly reset completed with errors');
                    })
                    .catch(error => {
                        logToConsole(`Error during weekly reset: ${error.message}`, true);
                    });

                // Run the weekly channel eligibility check with logging to specified channel
                const logChannelId = '843413781409169412'; // Your specified log channel
                weeklyChannelCheck(client, logChannelId)
                    .then(checkResults => {
                        logToConsole(`Channel check completed: ${checkResults.channelsChecked} channels checked, ${checkResults.friendsRemoved} friends removed`);
                    })
                    .catch(error => {
                        logToConsole(`Error during weekly channel check: ${error.message}`, true);
                    });
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

// Handle errors to prevent crashing
process.on('unhandledRejection', (error) => {
    logToConsole(`Unhandled promise rejection: ${error.message}`, true);
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    logToConsole(`Uncaught exception: ${error.message}`, true);
    console.error('Uncaught exception:', error);
    // Don't exit the process, try to keep the bot running
});

// Login
client.login(process.env.DISCORD_TOKEN).catch((error) => {
    console.error('Failed to login:', error);
});

module.exports = client;
