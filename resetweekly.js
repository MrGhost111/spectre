const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
    ]
});

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    try {
        const { weeklyReset } = require('./events/mupdate.js');
        const success = await weeklyReset(client);
        console.log(success ? 'Reset completed successfully' : 'Reset finished with errors');
    } catch (e) {
        console.error('Reset failed:', e);
    } finally {
        client.destroy();
        process.exit(0);
    }
});

client.login(process.env.DISCORD_TOKEN);
