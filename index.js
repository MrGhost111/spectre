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

// Collections and Maps
client.commands = new Collection();
client.textCommands = new Collection();
client.snipedMessages = new Collection();
client.editedMessages = new Collection();
client.itemPrices = new Map();
client.prefix = ','; // Define your command prefix here

// Load commands
const loadCommands = () => {
    const textCommandFiles = fs.readdirSync('./text-commands').filter(file => file.endsWith('.js'));
    for (const file of textCommandFiles) {
        const command = require(`./text-commands/${file}`);
        if (command.name) {
            client.textCommands.set(command.name, command);
            console.log(`Loaded text command: ${command.name}`);
        }
        if (command.aliases?.length) {
            command.aliases.forEach(alias => {
                client.textCommands.set(alias, command);
            });
        }
    }
    const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(`./commands/${file}`);
        if (command.data && command.data.name) {
            client.commands.set(command.data.name, command);
            console.log(`Loaded slash command: ${command.data.name}`);
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

// Load commands and events
loadCommands();
loadEvents();
try {
    const chatHandler = require('./utils/chatHandler').initialize('YOUR_OPENAI_API_KEY');
    console.log('ChatHandler initialized successfully');
} catch (error) {
    console.error('Failed to initialize ChatHandler:', error);
}

// Client ready handler
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);

    // Set the bot's status to idle
    client.user.setStatus('idle');

    // Initialize systems
    client.muteManager = new MuteManager(client);
    console.log('Systems initialized:');
    console.log('- Mute Manager');

    // Weekly reset and channel check schedule
    const { weeklyReset } = require('./events/mupdate.js');
    const { weeklyChannelCheck } = require('./utils/autoch.js');

    cron.schedule('0 0 * * 0', async () => {
        console.log('Weekly reset triggered at:', new Date().toISOString());
        try {
            // Run the weekly reset
            const resetSuccess = await weeklyReset(client);
            console.log(resetSuccess ? 'Weekly reset completed successfully' : 'Weekly reset completed with errors');

            // Run the weekly channel eligibility check with logging to specified channel
            const logChannelId = '843413781409169412'; // Your specified log channel
            const checkResults = await weeklyChannelCheck(client, logChannelId);
            console.log(`Channel check completed: ${checkResults.channelsChecked} channels checked, ${checkResults.friendsRemoved} friends removed`);
        } catch (error) {
            console.error('Unhandled error during weekly processes:', error);

            // Try to log the error to the channel as well
            try {
                const logChannel = await client.channels.fetch('843413781409169412');
                await logChannel.send(`❌ **Error during weekly processes:** ${error.message}`);
            } catch (channelError) {
                console.error('Failed to log error to channel:', channelError);
            }
        }
    }, {
        timezone: "UTC",
        scheduled: true,
        runOnInit: false
    });

    console.log('Weekly reset and channel check schedules set up successfully');
});

// Login
client.login(process.env.DISCORD_TOKEN);
module.exports = client;