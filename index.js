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
client.trackedDonations = new Map();
client.prefix = ','; // Define your command prefix here

// Load commands
const loadCommands = () => { /* (Existing Command Loading Logic - No Changes) */ };
const loadEvents = () => { /* (Existing Event Loading Logic - No Changes) */ };

// 🔹 Detect Pending Confirmation Donations
client.on('messageCreate', async message => {
    const DANK_MEMER_BOT_ID = '270904126974590976';
    const TRANSACTION_CHANNEL_ID = '833246120389902356';

    if (message.author.id !== DANK_MEMER_BOT_ID || message.channel.id !== TRANSACTION_CHANNEL_ID) return;
    if (!message.embeds?.length) return;

    const embed = message.embeds[0];
    if (!embed.title?.includes('Pending Confirmation')) return;

    const confirmButton = message.components?.[0]?.components?.find(comp => comp.label === 'Confirm');
    if (!confirmButton) return;

    // Store pending donation message
    client.trackedDonations.set(message.id, { originalMessage: message, user: message.interaction?.user?.id });
});

// 🔹 Track Donation Confirmation and Update Stats
client.on('interactionCreate', async interaction => {
    if (!interaction.isMessageComponent()) return;
    if (!interaction.customId.includes('confirm')) return;

    const message = interaction.message;
    if (!client.trackedDonations?.has(message.id)) return;

    let donationText = message.components?.[0]?.components?.find(comp => comp.type === 10)?.content || "";
    const donationMatch = donationText.match(/Successfully donated \*\*⏣\s*([\d,]+)\*\*/);

    if (!donationMatch) return;

    const donationAmount = parseInt(donationMatch[1].replace(/,/g, ''), 10);
    const donorId = client.trackedDonations.get(message.id).user;
    if (!donorId) return;

    // Update user donation data
    const guild = await client.guilds.fetch(client.guilds.cache.first().id);
    const member = await guild.members.fetch(donorId);

    usersData[donorId] = usersData[donorId] || {};
    usersData[donorId].totalDonated = (usersData[donorId].totalDonated || 0) + donationAmount;
    usersData[donorId].weeklyDonated = (usersData[donorId].weeklyDonated || 0) + donationAmount;
    usersData[donorId].lastDonation = new Date().toISOString();
    usersData[donorId].currentTier = member.roles.cache.has(TIER_2_ROLE_ID) ? 2 :
        (member.roles.cache.has(TIER_1_ROLE_ID) ? 1 : 0);

    statsData.totalDonations += donationAmount;
    saveStatsData();
    saveUsersData();

    const requirement = usersData[donorId].currentTier === 2 ? TIER_2_REQUIREMENT : TIER_1_REQUIREMENT;

    const donationEmbed = new EmbedBuilder()
        .setTitle('<:prize:1000016483369369650> New Donation')
        .setColor('#4c00b0')
        .setDescription(`<@${donorId}> donated ⏣ ${formatNumber(donationAmount)}\n\n<:purpledot:860074414853586984> Weekly Progress: ⏣ ${formatNumber(usersData[donorId].weeklyDonated)}/${formatNumber(requirement + (usersData[donorId].missedAmount || 0))}`)
        .setTimestamp();

    const transactionChannel = await client.channels.fetch(TRANSACTION_CHANNEL_ID).catch(() => null);
    if (transactionChannel) await transactionChannel.send({ embeds: [donationEmbed] });

    setImmediate(() => {
        updateStatusBoard(client).catch(console.error);
    });

    client.trackedDonations.delete(message.id);
});

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

// Login
client.login(process.env.DISCORD_TOKEN);

module.exports = client;