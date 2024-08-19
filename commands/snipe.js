const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

let lastDeletedMessage = null;

client.on('messageDelete', message => {
    lastDeletedMessage = message;
});

client.on('messageCreate', message => {
    if (message.content === ',snipe') {
        if (lastDeletedMessage) {
            message.channel.send(`Last deleted message: ${lastDeletedMessage.content}`);
        } else {
            message.channel.send('No messages have been deleted recently.');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
