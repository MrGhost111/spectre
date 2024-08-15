const { Client, GatewayIntentBits, Events, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType, StringSelectMenuBuilder } = require('discord.js');
require('dotenv').config();
const fs = require('fs');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageContent
    ]
});

// Load user data
let usersData;
try {
    usersData = JSON.parse(fs.readFileSync('./data/users.json', 'utf8'));
} catch (error) {
    console.error('Error reading or parsing users.json:', error);
    usersData = {};
}

// Load channel data
let channelData = {};
try {
    channelData = JSON.parse(fs.readFileSync('./data/channel.json', 'utf8'));
} catch (error) {
    console.error('Error reading or parsing channel.json:', error);
    channelData = {};
}

client.once(Events.ClientReady, () => {
    console.log('Bot is online!');
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.type === InteractionType.ApplicationCommand) {
        if (interaction.commandName === 'mychan') {
            const requiredRole = '768448955804811274'; // Replace with actual role ID
            const userRoles = interaction.member.roles.cache;
            if (!userRoles.has(requiredRole)) {
                return interaction.reply('You do not have the required role to use this command.');
            }

            const userId = interaction.user.id;
            const channel = interaction.guild.channels.cache.find(c => c.name === `${userId}-channel`);
            if (!channel) {
                const button = new ButtonBuilder()
                    .setCustomId('create_channel')
                    .setLabel('Create Channel')
                    .setStyle(ButtonStyle.Primary);

                const row = new ActionRowBuilder().addComponents(button);

                return interaction.reply({
                    content: 'You do not own a channel. Click the button below to create one.',
                    components: [row]
                });
            } else {
                const channelInfo = {
                    mention: channel.toString(),
                    owner: `<@${userId}>`,
                    creationDate: channel.createdAt.toDateString(),
                    capacity: channel.type === 'GUILD_TEXT' ? channel.guild.members.cache.size : 'N/A'
                };

                return interaction.reply({
                    content: `You already own a channel:\n- Mention: ${channelInfo.mention}\n- Owner: ${channelInfo.owner}\n- Creation Date: ${channelInfo.creationDate}\n- Capacity: ${channelInfo.capacity}`
                });
            }
        }
    } else if (interaction.isButton()) {
        if (interaction.customId === 'create_channel') {
            const modal = new ModalBuilder()
                .setCustomId('channel_modal')
                .setTitle('Create Your Channel')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('channel_name')
                            .setLabel('Enter the channel name:')
                            .setStyle(TextInputStyle.Short)
                    )
                );

            return interaction.showModal(modal);
        }
    } else if (interaction.isModalSubmit()) {
        if (interaction.customId === 'channel_modal') {
            const channelName = interaction.fields.getTextInputValue('channel_name');
            const guild = interaction.guild;
            const userId = interaction.user.id;

            // Check if a channel with the same name already exists
            const existingChannel = guild.channels.cache.find(c => c.name === channelName);
            if (existingChannel) {
                return interaction.reply('A channel with that name already exists.');
            }

            // Create a new channel
            const newChannel = await guild.channels.create({
                name: channelName,
                type: 'GUILD_TEXT',
                reason: 'Channel created by bot'
            });

            // Save channel information
            channelData[userId] = {
                id: newChannel.id,
                name: channelName
            };

            fs.writeFileSync('./data/channel.json', JSON.stringify(channelData, null, 2));

            return interaction.reply(`Channel ${newChannel.toString()} created successfully!`);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
