const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

let lastEditedMessage = null;

client.on('messageUpdate', (oldMessage, newMessage) => {
    lastEditedMessage = { oldMessage, newMessage };
});

client.on('messageCreate', message => {
    if (message.content === '!esnipe') {
        if (lastEditedMessage) {
            message.channel.send(`Last edited message: ${lastEditedMessage.oldMessage.content} -> ${lastEditedMessage.newMessage.content}`);
        } else {
            message.channel.send('No messages have been edited recently.');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
