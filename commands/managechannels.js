const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mychan')
        .setDescription('Manage your channel'),
    async execute(interaction) {
        const roleName = 'Getting That Dough (1 bil+)'; // The role required to manage channels
        const user = interaction.user;
        const guild = interaction.guild;
        const member = guild.members.cache.get(user.id);

        // Check if user has the required role
        if (!member.roles.cache.some(role => role.name === roleName)) {
            await interaction.reply({ content: 'You do not have the required role to manage channels.', ephemeral: true });
            return;
        }

        // Read user data
        const data = JSON.parse(fs.readFileSync('./data/users.json', 'utf8'));
        const userId = user.id;

        if (!data[userId] || !data[userId].channelId) {
            // User does not own a channel
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('createChannel')
                    .setLabel('Create Channel')
                    .setStyle(ButtonStyle.PRIMARY)
            );

            await interaction.reply({ content: 'You do not own a channel. Click the button below to create one.', components: [row], ephemeral: true });
        } else {
            // User owns a channel
            const channelId = data[userId].channelId;
            const channel = guild.channels.cache.get(channelId);
            await interaction.reply({ content: `You own the channel ${channel}.`, ephemeral: true });
        }
    }
};
