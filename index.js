const { Client, GatewayIntentBits, Collection, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const MuteManager = require('./utils/muteManager');
require('dotenv').config();

// Define log channel ID for system issues
const LOG_CHANNEL_ID = 'REPLACE_WITH_YOUR_LOG_CHANNEL_ID'; // Replace with your log channel ID
const ADMIN_USER_ID = 'REPLACE_WITH_YOUR_ADMIN_ID'; // Replace with your user ID to receive DM logs

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

// Debug logging function that logs to Discord instead of console
async function logToDiscord(message, isError = false) {
    try {
        // Create a formatted message
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${timestamp}] ${isError ? '❌ ERROR: ' : '📝 INFO: '}${message}`;

        // Log to console as backup
        if (isError) {
            console.error(formattedMessage);
        } else {
            console.log(formattedMessage);
        }

        // Check if client is ready before attempting to send messages
        if (!client.isReady()) return;

        // Try sending to admin DM
        try {
            const admin = await client.users.fetch(ADMIN_USER_ID);
            if (admin) {
                await admin.send(formattedMessage);
            }
        } catch (dmError) {
            console.error('Failed to send log to admin DM:', dmError);

            // If DM fails, try logging to a channel
            try {
                const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
                if (logChannel) {
                    await logChannel.send(formattedMessage);
                }
            } catch (channelError) {
                // Both methods failed, can only log to console at this point
                console.error('Failed to log to Discord channel:', channelError);
            }
        }
    } catch (error) {
        // Critical error in logging function itself
        console.error('Critical error in logging function:', error);
    }
}

// Collections and Maps
client.commands = new Collection();
client.textCommands = new Collection();
client.snipedMessages = new Collection();
client.editedMessages = new Collection();
client.itemPrices = new Map();
client.prefix = ','; // Define your command prefix here
client.logToDiscord = logToDiscord; // Add logging function to client

// Load commands
const loadCommands = async () => {
    try {
        const textCommandFiles = fs.readdirSync('./text-commands').filter(file => file.endsWith('.js'));
        for (const file of textCommandFiles) {
            try {
                const command = require(`./text-commands/${file}`);
                if (command.name) {
                    client.textCommands.set(command.name, command);
                    await logToDiscord(`Loaded text command: ${command.name}`);
                }
                if (command.aliases?.length) {
                    command.aliases.forEach(alias => {
                        client.textCommands.set(alias, command);
                    });
                }
            } catch (error) {
                await logToDiscord(`Failed to load text command file ${file}: ${error.message}`, true);
            }
        }

        const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            try {
                const command = require(`./commands/${file}`);
                if (command.data && command.data.name) {
                    client.commands.set(command.data.name, command);
                    await logToDiscord(`Loaded slash command: ${command.data.name}`);
                }
            } catch (error) {
                await logToDiscord(`Failed to load slash command file ${file}: ${error.message}`, true);
            }
        }
    } catch (error) {
        await logToDiscord(`Critical error loading commands: ${error.message}`, true);
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
                await logToDiscord(`Loaded event: ${event.name}`);
            } catch (error) {
                await logToDiscord(`Failed to load event file ${file}: ${error.message}`, true);
            }
        }
    } catch (error) {
        await logToDiscord(`Critical error loading events: ${error.message}`, true);
    }
};

// Initialize ChatHandler
const initializeChatHandler = async () => {
    try {
        // Get the API key from environment variables for security
        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
            await logToDiscord('OpenAI API key not found in environment variables. ChatHandler initialization failed.', true);
            return false;
        }

        const chatHandler = require('./utils/chatHandler').initialize(apiKey);
        await logToDiscord('ChatHandler initialized successfully');
        return true;
    } catch (error) {
        await logToDiscord(`Failed to initialize ChatHandler: ${error.message}`, true);
        return false;
    }
};

// Client ready handler
client.once('ready', async () => {
    await logToDiscord(`Logged in as ${client.user.tag}!`);

    // Set the bot's status to idle
    client.user.setStatus('idle');
    client.user.setActivity('your DMs', { type: ActivityType.Listening });

    // Load commands and events
    await loadCommands();
    await loadEvents();

    // Initialize systems
    client.muteManager = new MuteManager(client);
    await logToDiscord('Mute Manager initialized');

    // Initialize ChatHandler after bot is ready
    const chatHandlerInitialized = await initializeChatHandler();

    // Setup cron job for weekly tasks
    setupWeeklyCronJobs();

    await logToDiscord(`Bot startup complete. ChatHandler initialized: ${chatHandlerInitialized}`);
});

// Setup weekly cron jobs
function setupWeeklyCronJobs() {
    try {
        // Weekly reset and channel check schedule
        const { weeklyReset } = require('./events/mupdate.js');
        const { weeklyChannelCheck } = require('./utils/autoch.js');

        cron.schedule('0 0 * * 0', async () => {
            await logToDiscord('Weekly reset triggered at: ' + new Date().toISOString());
            try {
                // Run the weekly reset
                const resetSuccess = await weeklyReset(client);
                await logToDiscord(resetSuccess ? 'Weekly reset completed successfully' : 'Weekly reset completed with errors');

                // Run the weekly channel eligibility check with logging to specified channel
                const logChannelId = '843413781409169412'; // Your specified log channel
                const checkResults = await weeklyChannelCheck(client, logChannelId);
                await logToDiscord(`Channel check completed: ${checkResults.channelsChecked} channels checked, ${checkResults.friendsRemoved} friends removed`);
            } catch (error) {
                await logToDiscord(`Unhandled error during weekly processes: ${error.message}`, true);

                // Try to log the error to the channel as well
                try {
                    const logChannel = await client.channels.fetch('843413781409169412');
                    await logChannel.send(`❌ **Error during weekly processes:** ${error.message}`);
                } catch (channelError) {
                    await logToDiscord(`Failed to log error to channel: ${channelError.message}`, true);
                }
            }
        }, {
            timezone: "UTC",
            scheduled: true,
            runOnInit: false
        });

        logToDiscord('Weekly reset and channel check schedules set up successfully');
    } catch (error) {
        logToDiscord(`Failed to set up cron jobs: ${error.message}`, true);
    }
}

// Handle errors to prevent crashing
process.on('unhandledRejection', async (error) => {
    await logToDiscord(`Unhandled promise rejection: ${error.message}`, true);
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', async (error) => {
    await logToDiscord(`Uncaught exception: ${error.message}`, true);
    console.error('Uncaught exception:', error);
    // Don't exit the process, try to keep the bot running
});

// Login
client.login(process.env.DISCORD_TOKEN).catch(async (error) => {
    console.error('Failed to login:', error);
    // Can't use logToDiscord here as client isn't logged in yet
});

module.exports = client;