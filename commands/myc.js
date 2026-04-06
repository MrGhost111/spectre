const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const dataPath = './data/channels.json';

const ROLE_CONFIG = {
    '768448955804811274': { limit: 5 },
    '768449168297033769': { limit: 5 },
    '946729964328337408': { limit: 5 },
    '1028256286560763984': { limit: 5 },
    '1028256279124250624': { limit: 5 },
    '1038106794200932512': { limit: 5 },
    '783032959350734868': { limit: 10 },
    '1038888209440067604': { limit: 5, requiresRole: '783032959350734868' },
    '1349716423706148894': { limit: 5 },
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mychannel')
        .setDescription('Manage your channel'),

    async execute(interaction) {
        const requiredRoles = Object.keys(ROLE_CONFIG);
        if (!interaction.member.roles.cache.some(role => requiredRoles.includes(role.id))) {
            return interaction.reply({
                content: 'You do not have the required role to run this command.',
                ephemeral: true,
            });
        }
        await handleMyChannelCommand(interaction);
    },
};

async function readChannelsData() {
    try {
        return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    } catch (error) {
        console.error('Error reading channels.json:', error);
        return null;
    }
}

async function handleMyChannelCommand(interaction) {
    const channelsData = await readChannelsData();
    if (!channelsData) {
        return interaction.reply({
            content: 'Error reading channel data. Please contact an administrator.',
            ephemeral: true,
        });
    }

    const userChannel = channelsData[interaction.user.id] ||
        Object.values(channelsData).find(ch => ch.userId === interaction.user.id);

    if (userChannel) {
        try {
            const channel = await interaction.guild.channels.fetch(userChannel.channelId);
            if (channel) {
                return handleExistingChannel(interaction, channel, userChannel, channelsData);
            }
        } catch (error) {
            console.error('Error fetching channel:', error);
            delete channelsData[interaction.user.id];
            fs.writeFileSync(dataPath, JSON.stringify(channelsData, null, 2));
            return interaction.reply({
                content: 'Your channel could not be found. The data has been cleared. Please use the command again to create a new channel.',
                ephemeral: true,
            });
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('No Channel Found')
        .setDescription('You do not own any channel. Would you like to create one?')
        .setColor(0xFF0000);

    const button = new ButtonBuilder()
        .setCustomId('create_channel')
        .setLabel('Create Channel')
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function handleExistingChannel(interaction, channel, userChannel, channelsData) {
    const maxFriends = calculateMaxFriends(interaction.member);

    // Check for friends who have left the server and remove them from the list
    const leftNotices = [];
    const validFriends = [];
    for (const friendId of userChannel.friends) {
        const member = await interaction.guild.members.fetch(friendId).catch(() => null);
        if (!member) {
            leftNotices.push(`<@${friendId}> has left the server and was removed from your friends list.`);
            // Also clean up their permission overwrite if it still exists
            const overwrite = channel.permissionOverwrites.cache.get(friendId);
            if (overwrite) await overwrite.delete().catch(console.error);
        } else {
            validFriends.push(friendId);
        }
    }

    // Save updated friends list if anyone was removed
    if (leftNotices.length > 0) {
        userChannel.friends = validFriends;
        channelsData[interaction.user.id] = userChannel;
        fs.writeFileSync(dataPath, JSON.stringify(channelsData, null, 2), 'utf8');
    }

    const rolesList = Object.entries(ROLE_CONFIG).map(([roleId, config]) => {
        const hasRole = interaction.member.roles.cache.has(roleId);
        const emoji = hasRole ? '<a:tick:1276746433495830620>' : '<a:crossmark:1276746067026903061>';
        return `${emoji} <@&${roleId}> ${config.limit}`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setTitle('Channel Information')
        .setDescription(
            `**Channel:** <#${channel.id}>\n\n` +
            `**Owner:** <@${interaction.user.id}>\n\n` +
            `**Created On:** <t:${Math.floor(channel.createdTimestamp / 1000)}:D>\n\n` +
            `**Invited Friends:** ${validFriends.length} / ${maxFriends}\n\n` +
            `**Role Thresholds:**\n${rolesList}\n\n` +
            `**Use </addfriends:1287658557713678389> and </removefriends:1287658557713678395> to manage channel members**`
        )
        .setFooter({ text: `Channel Owner ID: ${userChannel.userId}` })
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

    // Notify about removed friends in a follow-up (ephemeral so only the owner sees it)
    if (leftNotices.length > 0) {
        await interaction.followUp({
            content: leftNotices.join('\n'),
            ephemeral: true,
        });
    }
}

function calculateMaxFriends(member) {
    let total = 0;
    for (const [roleId, config] of Object.entries(ROLE_CONFIG)) {
        if (member.roles.cache.has(roleId)) {
            if (config.requiresRole) {
                if (member.roles.cache.has(config.requiresRole)) total += config.limit;
            } else {
                total += config.limit;
            }
        }
    }
    return total;
}