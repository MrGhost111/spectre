const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
require('dotenv').config();

<<<<<<< HEAD
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });

client.once('ready', () => {
=======
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
>>>>>>> f8533b409f1cbcda1b34e365206c6eb34d898b02
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async message => {
<<<<<<< HEAD
  // Ignore messages from bots
  if (message.author.bot) return;

  // Check if the message starts with the command prefix
  if (message.content.startsWith(',')) {
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'ping') {
      message.channel.send('Pong!');
    } else if (command === 'members') {
      try {
        // Fetch all members of the guild
        const members = await message.guild.members.fetch();
        // Get the permission overwrites for the channel
        const overwrites = message.channel.permissionOverwrites.cache;
        // Filter members by those who have explicit permission overwrites and are not bots
        const channelMembers = members.filter(member => overwrites.has(member.id) && !member.user.bot);
        
        if (channelMembers.size === 0) {
          message.channel.send('No members found in this channel.');
        } else {
          // Get the IDs of the members and join them with spaces
          const memberIds = channelMembers.map(member => member.id).join(' ');
          // Send the IDs as a message
          message.channel.send(`${memberIds}`);
        }
      } catch (error) {
        console.error('Error fetching members:', error);
        message.channel.send('There was an error retrieving the member IDs.');
      }
    }
=======
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
>>>>>>> f8533b409f1cbcda1b34e365206c6eb34d898b02
  }
});

client.login(process.env.DISCORD_TOKEN);
