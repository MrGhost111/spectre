const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
require('dotenv').config();
let usersData; 
try {
// Load user data
userData = JSON.parse(fs.readFileSync('./data/users.json', 'utf8'));
catch (error) {console.error('error reading or parsing users.json', error);
usersDara = {}; 
}
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once('ready', () => {
    console.log('Bot is online!');
});

client.on('messageCreate', message => {
    if (message.content.startsWith('!addfriend')) {
        const userId = message.author.id;
        const friendId = message.mentions.users.first().id;

        if (!userData[userId]) {
            userData[userId] = { friends: [] };
        }

        userData[userId].friends.push(friendId);
        fs.writeFileSync('./data/users.json', JSON.stringify(userData, null, 2));
        message.channel.send('Friend added!');
    }
});

client.login(process.env.BOT_TOKEN);
