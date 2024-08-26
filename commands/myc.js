const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const dataPath = './data/channels.json';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mychannel')
        .setDescription('Manage your channel'),
    async execute(interaction) {
        await handleMyChannelCommand(interaction);
    },
    async handleInteraction(interaction) {
        if (interaction.isButton()) {
            await handleButtonInteraction(interaction);
        } else if (interaction.isModalSubmit()) {
            await handleModalSubmit(interaction);
        }
    },
};

async function handleMyChannelCommand(interaction) {
    const channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const userChannel = Object.values(channelsData).find(ch => ch.userId === interaction.user.id);

    if (userChannel) {
        const channel = interaction.guild.channels.cache.get(userChannel.channelId);
        if (!channel) {
            return interaction.reply('Channel not found.');
        }

        const maxFriends = calculateMaxFriends(interaction.member);

        const roles = [
            { id: '768448955804811274', limit: 5 },
            { id: '768449168297033769', limit: 5 },
            { id: '946729964328337408', limit: 5 },
            { id: '1028256286560763984', limit: 2 },
            { id: '1028256279124250624', limit: 3 },
            { id: '1038106794200932512', limit: 5 },
        ];

        const roleThresholds = roles.map(role => {
            const hasRole = interaction.member.roles.cache.has(role.id);
            const emoji = hasRole ? '<a:tick:1276746433495830620>' : '<a:crossmark:1276746067026903061>';
            return `${emoji} <@&${role.id}> ${role.limit}`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setTitle('Channel Information')
            .setDescription(
                `**Channel:** <#${channel.id}>\n\n` +
                `**Owner:** <@${interaction.user.id}>\n\n` +
                `**Created On:** <t:${Math.floor(channel.createdTimestamp / 1000)}:D>\n\n` +
                `**Invited Friends:** ${userChannel.friends.length} / ${maxFriends}\n\n` +
                `**Role Thresholds:**\n${roleThresholds}`
            )
            .setFooter({ text: `Channel Owner ID: ${userChannel.userId}` }) // Added footer with owner ID
            .setColor(0x6666ff);

        const isOwner = interaction.user.id === userChannel.userId;

        const renameButton = new ButtonBuilder()
            .setCustomId('rename_channel')
            .setLabel('Rename Channel')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!isOwner);

        const viewFriendsButton = new ButtonBuilder()
            .setCustomId('view_friends')
            .setLabel('View Friends')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:user:1273754877646082048>')
            .setDisabled(!isOwner);

        const row = new ActionRowBuilder().addComponents(renameButton, viewFriendsButton);

        await interaction.reply({ embeds: [embed], components: [row] });

    } else {
        const embed = new EmbedBuilder()
            .setTitle('No Channel Found')
            .setDescription('You do not own any channel. Would you like to create one?')
            .setColor(0xFF0000);

        const button = new ButtonBuilder()
            .setCustomId('create_channel')
            .setLabel('Create Channel')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        const reply = await interaction.reply({ embeds: [embed], components: [row] });

        setTimeout(async () => {
            button.setDisabled(true);
            await reply.edit({ components: [new ActionRowBuilder().addComponents(button)] });
        }, 10000);
    }
}

async function handleButtonInteraction(interaction) {
    const dataPath = './data/channels.json';
    const channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    const userChannel = Object.values(channelsData).find(ch => ch.userId === interaction.user.id);

    // Check if the user is the owner of the channel
    const channelOwnerId = interaction.message.embeds[0]?.footer?.text?.replace('Channel Owner ID: ', '');
    if (interaction.user.id !== channelOwnerId) {
        return interaction.reply({ content: "You don't have permission to use this button.", ephemeral: true });
    }

    if (interaction.customId === 'create_channel') {
        if (userChannel) {
            await interaction.reply({ content: "You already own a channel.", ephemeral: true });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId('create_channel_modal')
            .setTitle('Create Your Channel');

        const nameInput = new TextInputBuilder()
            .setCustomId('channel_name_input')
            .setLabel('Channel Name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(nameInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    } else if (interaction.customId === 'rename_channel') {
        if (!userChannel || userChannel.userId !== interaction.user.id) {
            await interaction.reply({ content: "You don't own a channel.", ephemeral: true });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId('rename_channel_modal')
            .setTitle('Rename Your Channel');

        const nameInput = new TextInputBuilder()
            .setCustomId('new_channel_name_input')
            .setLabel('New Channel Name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(nameInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    } else if (interaction.customId === 'view_friends') {
        if (!userChannel || userChannel.userId !== interaction.user.id) {
            await interaction.reply({ content: "You don't own a channel.", ephemeral: true });
            return;
        }

        const friends = userChannel.friends;
        const friendsMentions = friends.map(friendId => `<@${friendId}>`).join('\n');
        const totalFriends = friends.length;

        const embed = new EmbedBuilder()
            .setTitle(`Friends (${totalFriends}/${calculateMaxFriends(interaction.member)})`)
            .setDescription(friendsMentions || 'No friends added.');

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

async function handleModalSubmit(interaction) {
    const dataPath = './data/channels.json';
    const channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    if (interaction.customId === 'create_channel_modal') {
        const channelName = interaction.fields.getTextInputValue('channel_name_input');

        const existingChannel = Object.values(channelsData).find(ch => ch.channelId && interaction.guild.channels.cache.get(ch.channelId));
        if (existingChannel) {
            delete channelsData[existingChannel.userId];
            fs.writeFileSync(dataPath, JSON.stringify(channelsData, null, 2));
        }

        const categoryId = '842471433238347786'; // Default category
        const category = interaction.guild.channels.cache.get(categoryId);

        let channel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category,
        });

        channelsData[interaction.user.id] = {
            userId: interaction.user.id,
            channelId: channel.id,
            friends: [],
        };
        fs.writeFileSync(dataPath, JSON.stringify(channelsData, null, 2));

        await interaction.reply(`Channel ${channel} created successfully!`);
    } else if (interaction.customId === 'rename_channel_modal') {
        const newName = interaction.fields.getTextInputValue('new_channel_name_input');

        const userChannel = Object.values(channelsData).find(ch => ch.userId === interaction.user.id);
        if (!userChannel) {
            await interaction.reply({ content: "You don't own a channel.", ephemeral: true });
            return;
        }

        const channel = interaction.guild.channels.cache.get(userChannel.channelId);
        if (!channel) {
            await interaction.reply({ content: "Channel not found.", ephemeral: true });
            return;
        }

        await channel.setName(newName);
        await interaction.reply(`Channel name changed to ${newName}`);
    }
}

// Helper function to calculate the maximum number of friends based on roles
function calculateMaxFriends(member) {
    const roleLimits = {
        '768448955804811274': 5,
        '768449168297033769': 5,
        '946729964328337408': 5,
        '1028256286560763984': 2,
        '1028256279124250624': 3,
        '1038106794200932512': 5,
    };

    let maxFriends = 0;
    member.roles.cache.forEach(role => {
        if (roleLimits[role.id]) {
            maxFriends += roleLimits[role.id];
        }
    });

    return maxFriends;
}
