require('dotenv').config();

const { Client, GatewayIntentBits, SlashCommandBuilder, SelectMenuBuilder, ActionRowBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, // Essential for most bots
    GatewayIntentBits.GuildMessages, // For message related interactions
    GatewayIntentBits.GuildMembers, // For managing members and selecting users
    GatewayIntentBits.GuildMessageReactions, // For reactions to messages
  ],
});

// Example Slash Command
const command = new SlashCommandBuilder()
  .setName('test')
  .setDescription('A test command');

client.once('ready', async () => {
  console.log(`Ready! Logged in as ${client.user.tag}`);

  // Register Slash Command
  await client.application.commands.create(command.toJSON());
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === 'test') {
    // Example interaction handling
    const selectMenu = new SelectMenuBuilder()
      .setCustomId('user_select')
      .setPlaceholder('Select a user')
      // Add options to select users (you'll need to fetch members)
      .addOptions([
        // Example option
        {
          label: 'User 1',
          value: 'user1_id',
        },
      ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({ content: 'Select a user:', components: [row] });
  }
});

client.login(process.env.DISCORD_TOKEN);
