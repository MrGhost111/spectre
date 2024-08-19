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

  await client.application.commands.create(selectUsersCommand);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === 'selectusers') {
    const channel = interaction.channel;
    const recentMessages = await channel.messages.fetch({ limit: 50 });

    const uniqueUsers = new Set();
    recentMessages.forEach(message => uniqueUsers.add(message.author.id));

    const userOptions = Array.from(uniqueUsers)
      .map(userId => client.users.cache.get(userId))
      .filter(user => user)
      .map(user => ({
        label: user.username,
        value: user.id,
      }));

    const userSelect = new UserSelectMenuBuilder()
  .setCustomId('user_select')
  .setMinValues(1)
  .setMaxValues(3)
  .setPlaceholder('Select up to 3 users')
  .addOptions(userOptions);
    const row = new ActionRowBuilder().addComponents(userSelect);

    await interaction.reply({ content: 'Select users:', components: [row] });
  }

  // Handle search modal
  if (interaction.customId === 'user_search') {
    const searchQuery = interaction.fields.getTextInputValue('search_query');
    // Implement search logic based on searchQuery
    // Update select menu options accordingly
    await interaction.update({ content: 'Updated user list', components: [row] });
  }
});

client.login(process.env.DISCORD_TOKEN);
module.exports = { client };