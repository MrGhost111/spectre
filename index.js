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
const loadCommands = () => { /* (Existing Command Loading Logic - No Changes) */ };
const loadEvents = () => { /* (Existing Event Loading Logic - No Changes) */ };

// Fix: Track Donations via Interaction Updates
client.on('interactionCreate', async interaction => {
    if (!interaction.isMessageComponent()) return;

    const message = interaction.message;
    const DANK_MEMER_BOT_ID = '270904126974590976';
    const TRANSACTION_CHANNEL_ID = '833246120389902356';

    if (message.channel.id !== TRANSACTION_CHANNEL_ID || message.author.id !== DANK_MEMER_BOT_ID) return;

    // Extract donation data
    let donationText = "";
    if (message.embeds.length > 0) {
        donationText = message.embeds[0].description || "";
    } else if (message.components.length > 0) {
        const textComponent = message.components.find(comp => comp.type === 4);
        if (textComponent) donationText = textComponent.label || textComponent.value || "";
    }

    if (!donationText.includes('Successfully donated')) return;

    const donationMatch = donationText.match(/Successfully donated \*\*⏣\s*([\d,]+)\*\*/);
    if (!donationMatch) return;

    const donationAmount = parseInt(donationMatch[1].replace(/,/g, ''), 10);
    const donorId = await findCommandUser(message);
    if (!donorId) return;

    const guild = await client.guilds.fetch(client.guilds.cache.first().id);
    const member = await guild.members.fetch(donorId);

    // Update user donation data
    usersData[donorId] = usersData[donorId] || {};
    usersData[donorId].totalDonated = (usersData[donorId].totalDonated || 0) + donationAmount;
    usersData[donorId].weeklyDonated = (usersData[donorId].weeklyDonated || 0) + donationAmount;
    usersData[donorId].lastDonation = new Date().toISOString();
    usersData[donorId].currentTier = member.roles.cache.has(TIER_2_ROLE_ID) ? 2 : (member.roles.cache.has(TIER_1_ROLE_ID) ? 1 : 0);

    // Save data
    statsData.totalDonations += donationAmount;
    saveStatsData();
    saveUsersData();

    // Announce donation
    const requirement = usersData[donorId].currentTier === 2 ? TIER_2_REQUIREMENT : TIER_1_REQUIREMENT;

    const donationEmbed = new EmbedBuilder()
        .setTitle('<:prize:1000016483369369650>  New Donation')
        .setColor('#4c00b0')
        .setDescription(`<@${donorId}> donated ⏣ ${formatNumber(donationAmount)}\n\n<:purpledot:860074414853586984>  Weekly Progress: ⏣ ${formatNumber(usersData[donorId].weeklyDonated)}/${formatNumber(requirement + (usersData[donorId].missedAmount || 0))}`)
        .setTimestamp();

    await message.channel.send({ embeds: [donationEmbed] });

    // Update status board
    setImmediate(() => {
        updateStatusBoard(client).catch(console.error);
    });
});

// Ensure data directory exists
const ensureDataDirExists = () => { /* (Existing Logic - No Changes) */ };
ensureDataDirExists();
loadCommands();
loadEvents();

// Client ready handler
client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);

    try {
        client.muteManager = new MuteManager(client);
        console.log('✅ Mute Manager initialized');
    } catch (error) {
        console.error('❌ Failed to initialize Mute Manager:', error);
    }

    try {
        client.donationCollector = initializeDonationTracking();
        console.log(client.donationCollector ? '✅ Donation Tracking initialized' : '❌ Donation Tracking failed to initialize');
    } catch (error) {
        console.error('❌ Error during donation collector setup:', error);
    }

    // Weekly reset schedule
    try {
        const { weeklyReset } = require('./events/mupdate.js');
        cron.schedule('0 0 * * 0', async () => {
            console.log('⏰ Weekly reset triggered:', new Date().toISOString());
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

client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('✅ Bot login successful'))
    .catch(error => console.error('❌ Bot login failed:', error));

process.on('unhandledRejection', error => {
    console.error('❌ Unhandled promise rejection:', error);
});

module.exports = client;