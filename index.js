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
    partials: [Partials.Channel], // FIXED: Proper syntax for DM support
});

// Simple logging function that logs to console
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
client.logToDiscord = logToConsole;

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
        logToConsole('========================================');
        logToConsole('📅 SETTING UP WEEKLY CRON JOBS');
        logToConsole('========================================');

        // Clear require cache to ensure fresh modules
        const mupdatePath = path.resolve(__dirname, './events/mupdate.js');
        const autochPath = path.resolve(__dirname, './utils/autoch.js');

        delete require.cache[mupdatePath];
        delete require.cache[autochPath];

        const { weeklyReset } = require('./events/mupdate.js');
        const { weeklyChannelCheck } = require('./utils/autoch.js');

        // Verify functions are loaded
        if (typeof weeklyReset !== 'function') {
            throw new Error('weeklyReset is not a function!');
        }
        if (typeof weeklyChannelCheck !== 'function') {
            throw new Error('weeklyChannelCheck is not a function!');
        }

        logToConsole('✅ Weekly reset functions loaded successfully');

        // Schedule: Every Sunday at 00:00 UTC (midnight)
        const cronSchedule = '0 0 * * 0';
        logToConsole(`📅 Cron schedule: "${cronSchedule}" (Every Sunday at midnight UTC)`);

        const job = cron.schedule(cronSchedule, async () => {
            const triggerTime = new Date().toISOString();
            logToConsole('========================================');
            logToConsole(`⏰ WEEKLY CRON JOB TRIGGERED`);
            logToConsole(`⏰ Time: ${triggerTime}`);
            logToConsole('========================================');

            try {
                // Clear require cache before running to get fresh data
                delete require.cache[mupdatePath];
                delete require.cache[autochPath];

                const { weeklyReset: freshWeeklyReset } = require('./events/mupdate.js');
                const { weeklyChannelCheck: freshWeeklyChannelCheck } = require('./utils/autoch.js');

                // Run the weekly reset
                logToConsole('🔄 Starting weekly reset...');
                const resetSuccess = await freshWeeklyReset(client);

                if (resetSuccess) {
                    logToConsole('✅ Weekly reset completed successfully');
                } else {
                    logToConsole('⚠️ Weekly reset completed with errors', true);
                }

                // Run the weekly channel eligibility check with logging to specified channel
                const logChannelId = '843413781409169412';
                logToConsole('🔄 Starting weekly channel check...');
                const checkResults = await freshWeeklyChannelCheck(client, logChannelId);
                logToConsole(`✅ Channel check completed: ${checkResults.channelsChecked} channels checked, ${checkResults.friendsRemoved} friends removed`);

                logToConsole('========================================');
                logToConsole('✅ WEEKLY TASKS COMPLETED SUCCESSFULLY');
                logToConsole('========================================');
            } catch (error) {
                logToConsole('========================================', true);
                logToConsole(`❌ CRITICAL ERROR DURING WEEKLY TASKS`, true);
                logToConsole(`❌ Error: ${error.message}`, true);
                logToConsole(`❌ Stack: ${error.stack}`, true);
                logToConsole('========================================', true);

                // Try to notify admin channel
                try {
                    const adminChannel = await client.channels.fetch('966598961353850910');
                    if (adminChannel) {
                        await adminChannel.send(`<:xmark:934659388386451516> **CRITICAL ERROR DURING AUTOMATED WEEKLY RESET**\n\`\`\`\n${error.message}\n\`\`\`\nPlease check logs and consider running \`,resetweekly\` manually.`);
                    }
                } catch (notifyError) {
                    logToConsole(`Failed to send error notification: ${notifyError.message}`, true);
                }
            }
        }, {
            timezone: "UTC",
            scheduled: true,
            runOnInit: false
        });

        // Verify job was created
        if (!job) {
            throw new Error('Cron job was not created!');
        }

        logToConsole('✅ Cron job created successfully');

        // Calculate next Sunday
        const now = new Date();
        const daysUntilSunday = (7 - now.getUTCDay()) % 7 || 7;
        const nextSunday = new Date(now);
        nextSunday.setUTCDate(now.getUTCDate() + daysUntilSunday);
        nextSunday.setUTCHours(0, 0, 0, 0);

        logToConsole(`📅 Next scheduled run: ${nextSunday.toISOString()}`);
        logToConsole(`📅 Days until next run: ${daysUntilSunday} days`);
        logToConsole('========================================');

    } catch (error) {
        logToConsole('========================================', true);
        logToConsole('❌ FAILED TO SET UP CRON JOBS', true);
        logToConsole(`❌ Error: ${error.message}`, true);
        logToConsole(`❌ Stack: ${error.stack}`, true);
        logToConsole('========================================', true);
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
    process.exit(1);
});

module.exports = client;