require('dotenv').config();

const { Client, GatewayIntentBits, SlashCommandBuilder, UserSelectMenuBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

const selectUsersCommand = new SlashCommandBuilder()
  .setName('selectusers')
  .setDescription('Select multiple users');

const searchModal = new ModalBuilder()
  .setCustomId('user_search')
  .setTitle('Search for Users');

const searchInput = new TextInputBuilder()
  .setCustomId('search_query')
  .setLabel('Search')
  .setStyle(TextInputStyle.Short);

const firstActionRow = new ActionRowBuilder().addComponents(searchInput);

searchModal.addComponents(firstActionRow);

client.once('ready', async () => {
  console.log(`Ready! Logged in as ${client.user.tag}`);

  // Load commands from the 'commands' folder
  const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const command = require(`./commands/${file}

    // Command validation and registration logic
    if (command.data && typeof command.execute === 'function') {
      client.application.commands.create(command.data);
    } else {
      console.error(`Error loading command ${file}: either 'data' or 'execute' is missing.`);
    }
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing command ${interaction.commandName}:`, error);
    await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);

module.exports = { client };
