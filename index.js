require('dotenv').config();

const fs = require('fs');
const Discord = require('discord.js');

const client = new Discord.Client({ intents: [Discord.Intents.FLAGS.GUILDS, Discord.Intents.FLAGS.GUILD_MESSAGES] });

client.commands = new Discord.Collection();

const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.name, command);
}

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async message => {
  if (!message.content.startsWith(',')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

  if (!command) return;

  try {
    await command.execute(message, args);
  } catch (error) {
    console.error(error);
    message.reply('There was an error trying to execute that command!');
  }
});

client.login(process.env.DISCORD_TOKEN);
