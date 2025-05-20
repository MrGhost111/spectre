// Simple test file to verify DM functionality
// Save this as testDM.js and run it with: node testDM.js

const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

// Create a minimal client with only the necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.MessageContent,
    ],
});

// On ready handler
client.once('ready', () => {
    console.log(`Bot is online as ${client.user.tag}`);
    console.log('Send a DM to the bot to test if it responds');
});

// Handle direct messages - extremely simplified
client.on('messageCreate', async (message) => {
    // Skip messages from bots and non-DM messages
    if (message.author.bot || message.guild) return;
    
    console.log(`Received DM from ${message.author.tag}: ${message.content}`);
    
    try {
        // Send typing indicator
        await message.channel.sendTyping();
        
        // Simple response to test if DMs work at all
        await message.reply("I received your DM! This is a test response.");
    } catch (error) {
        console.error('Error responding to DM:', error);
    }
});

// Login with your token
client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('Failed to login:', error);
});
