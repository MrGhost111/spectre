const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

// Create a new instance of a Discord client
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

// Log when the bot is online
client.once('ready', () => {
    console.log('Bot is online!');
});

// Handle incoming messages
client.on('messageCreate', message => {
    // Ignore messages from the bot itself
    if (message.author.bot) return;

    // Simple command handling
    if (message.content === '!ping') {
        message.channel.send('Pong!');
    }

});

// Login to Discord with your app's token
client.login(process.env.DISCORD_TOKEN);
