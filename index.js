const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
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
    partials: [Partials.Message, Partials.Channel, Partials.Reaction], // Add partials for message events
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
    // Load text commands
    try {
        const textCommandFiles = fs.readdirSync('./text-commands').filter(file => file.endsWith('.js'));
        for (const file of textCommandFiles) {
            try {
                const command = require(`./text-commands/${file}`);
                if (command.name) {
                    client.textCommands.set(command.name, command);
                    console.log(`✅ Loaded text command: ${command.name}`);
                } else {
                    console.warn(`⚠️ Text command file ${file} has no name property`);
                }
            } catch (error) {
                console.error(`❌ Error loading text command ${file}:`, error);
            }
        }
    } catch (error) {
        console.warn(`⚠️ Could not load text commands:`, error.message);
    }

    // Load slash commands
    try {
        const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            try {
                const command = require(`./commands/${file}`);
                if (command.data && command.data.name) {
                    client.commands.set(command.data.name, command);
                    console.log(`✅ Loaded slash command: ${command.data.name}`);
                } else {
                    console.warn(`⚠️ Slash command file ${file} has no data.name property`);
                }
            } catch (error) {
                console.error(`❌ Error loading slash command ${file}:`, error);
            }
        }
    } catch (error) {
        console.warn(`⚠️ Could not load slash commands:`, error.message);
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
                console.log(`✅ Loaded event: ${event.name}`);
            } catch (error) {
                console.error(`❌ Error loading event ${file}:`, error);
            }
        }
    } catch (error) {
        console.warn(`⚠️ Could not load events:`, error.message);
    }
};

// Initialize donation tracking
const initializeDonationTracking = () => {
    const DANK_MEMER_BOT_ID = '270904126974590976';
    const TRANSACTION_CHANNEL_ID = '833246120389902356';

    try {
        const channel = client.channels.cache.get(TRANSACTION_CHANNEL_ID);
        if (!channel) {
            console.error('❌ Transaction channel not found!');
            return null;
        }

        console.log(`✅ Setting up donation collector in channel: ${channel.name}`);
        return channel.createMessageCollector({
            filter: m => m.author.id === DANK_MEMER_BOT_ID,
            idle: 60_000
        }).on('collect', async message => {
            try {
                await require('./events/mupdate.js').handleDonation(client, message);
            } catch (error) {
                console.error('❌ Error handling donation message:', error);
            }
        });
    } catch (error) {
        console.error('❌ Failed to initialize donation tracking:', error);
        return null;
    }
};

// Ensure data directory exists
const ensureDataDirExists = () => {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        try {
            fs.mkdirSync(dataDir, { recursive: true });
            console.log('✅ Created data directory');
        } catch (error) {
            console.error('❌ Failed to create data directory:', error);
        }
    }
};

// Load commands and events
ensureDataDirExists();
loadCommands();
loadEvents();

// Client ready handler
client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);

    // Initialize systems
    try {
        client.muteManager = new MuteManager(client);
        console.log('✅ Mute Manager initialized');
    } catch (error) {
        console.error('❌ Failed to initialize Mute Manager:', error);
    }

    try {
        client.donationCollector = initializeDonationTracking();
        if (client.donationCollector) {
            console.log('✅ Donation Tracking initialized');
        } else {
            console.error('❌ Donation Tracking failed to initialize');
        }
    } catch (error) {
        console.error('❌ Error during donation collector setup:', error);
    }

    // Weekly reset schedule
    try {
        const { weeklyReset } = require('./events/mupdate.js');
        cron.schedule('0 0 * * 0', async () => {
            console.log('⏰ Weekly reset triggered at:', new Date().toISOString());
            try {
                const success = await weeklyReset(client);
                console.log(success ? '✅ Weekly reset completed successfully' : '⚠️ Weekly reset completed with errors');
            } catch (error) {
                console.error('❌ Unhandled error during weekly reset:', error);
            }
        }, {
            timezone: "UTC",
            scheduled: true,
            runOnInit: false
        });
        console.log('✅ Weekly reset schedule set up successfully');
    } catch (error) {
        console.error('❌ Failed to set up weekly reset schedule:', error);
    }
});

// Handle text commands (Messages)
client.on('messageCreate', async message => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Check for prefix commands
    if (message.content.startsWith(client.prefix)) {
        // Extract command name and arguments
        const args = message.content.slice(client.prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        console.log(`👤 ${message.author.tag} is trying to use text command: ${commandName}`);

        // Check if command exists
        const command = client.textCommands.get(commandName) ||
            client.textCommands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

        if (!command) return;

        // Execute the command
        try {
            console.log(`⚙️ Executing text command: ${commandName}`);
            await command.execute(message, args, client);
        } catch (error) {
            console.error(`❌ Error executing text command ${commandName}:`, error);
            await message.reply('There was an error executing that command!').catch(console.error);
        }
    }
});

// Handle slash commands (Interactions)
client.on('interactionCreate', async interaction => {
    // Handle button interactions
    try {
        if (interaction.isButton()) {
            console.log(`👤 ${interaction.user.tag} clicked button: ${interaction.customId}`);

            if (interaction.customId === 'risk') {
                await client.muteManager.handleRiskButton(interaction);
            }
            return;
        }

        // Handle slash command interactions
        if (!interaction.isChatInputCommand()) return;

        const commandName = interaction.commandName;
        console.log(`👤 ${interaction.user.tag} is trying to use slash command: ${commandName}`);

        const command = client.commands.get(commandName);

        if (!command) {
            console.error(`❌ No command matching ${commandName} was found.`);
            return;
        }

        try {
            console.log(`⚙️ Executing slash command: ${commandName}`);
            await command.execute(interaction);
        } catch (error) {
            console.error(`❌ Error executing slash command ${commandName}:`, error);

            const errorReply = {
                content: 'There was an error executing this command!',
                ephemeral: true
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorReply).catch(console.error);
            } else {
                await interaction.reply(errorReply).catch(console.error);
            }
        }
    } catch (error) {
        console.error('❌ Unhandled error in interaction handler:', error);
    }
});

// Login
client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('✅ Bot login successful'))
    .catch(error => console.error('❌ Bot login failed:', error));

process.on('unhandledRejection', error => {
    console.error('❌ Unhandled promise rejection:', error);
});

module.exports = client;