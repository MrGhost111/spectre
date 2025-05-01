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

// Initialize donation tracking
const initializeDonationTracking = () => {
    const DANK_MEMER_BOT_ID = '270904126974590976';
    const TRANSACTION_CHANNEL_ID = '833246120389902356';

    const channel = client.channels.cache.get(TRANSACTION_CHANNEL_ID);
    if (!channel) {
        console.error('Transaction channel not found!');
        return null;
    }

    return channel.createMessageCollector({
        filter: m => m.author.id === DANK_MEMER_BOT_ID,
        idle: 60_000
    }).on('collect', async message => {
        await require('./events/mupdate.js').handleDonation(client, message);
    });
};

// Load commands and events
loadCommands();
loadEvents();

// Client ready handler
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);

    // Initialize systems
    client.muteManager = new MuteManager(client);
    client.donationCollector = initializeDonationTracking();

    console.log('Systems initialized:');
    console.log('- Mute Manager');
    console.log('- Donation Tracking');

    // Weekly reset schedule
    const { weeklyReset } = require('./events/mupdate.js');
    cron.schedule('0 0 * * 0', async () => {
        console.log('Weekly reset triggered at:', new Date().toISOString());
        try {
            const success = await weeklyReset(client);
            console.log(success ? 'Weekly reset completed successfully' : 'Weekly reset completed with errors');
        } catch (error) {
            console.error('Unhandled error during weekly reset:', error);
        }
    }, {
        timezone: "UTC",
        scheduled: true,
        runOnInit: false
    });
    console.log('Weekly reset schedule set up successfully');
});

// Handle text commands (Messages)
client.on('messageCreate', async message => {
    // Ignore bot messages and messages without prefix
    if (message.author.bot || !message.content.startsWith(client.prefix)) return;

    // Extract command name and arguments
    const args = message.content.slice(client.prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    // Check if command exists
    const command = client.textCommands.get(commandName) ||
        client.textCommands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

    if (!command) return;

    // Execute the command
    try {
        await command.execute(message, args, client);
    } catch (error) {
        console.error(`Error executing text command ${commandName}:`, error);
        await message.reply('There was an error executing that command!').catch(console.error);
    }
});

// Handle slash commands (Interactions)
client.on('interactionCreate', async interaction => {
    // Handle button interactions
    if (interaction.isButton()) {
        if (interaction.customId === 'risk') {
            await client.muteManager.handleRiskButton(interaction);
        }
        return;
    }

    // Handle slash command interactions
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing slash command ${interaction.commandName}:`, error);

        const errorReply = {
            content: 'There was an error executing this command!',
            ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorReply);
        } else {
            await interaction.reply(errorReply);
        }
    }
});

// Login
client.login(process.env.DISCORD_TOKEN);

module.exports = client;