const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const dataPath = './data/channels.json';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mychannel')
        .setDescription('Manage your channel'),
    async execute(interaction) {
        await handleMyChannelCommand(interaction);
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
            { id: '1028256286560763984', limit: 5 },
            { id: '1028256279124250624', limit: 5 },
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

// Helper function to calculate the maximum number of friends based on roles
function calculateMaxFriends(member) {
    const roleLimits = {
        '768448955804811274': 5, // Role ID 1
        '768449168297033769': 5, // Role ID 2
        '946729964328337408': 5, // Role ID 3
        '1028256286560763984': 5, // Role ID 4
        '1028256279124250624': 5, // Role ID 5
        '1038106794200932512': 5, // Role ID 6
    };

    let maxFriends = 0;

    for (const [roleId, limit] of Object.entries(roleLimits)) {
        if (member.roles.cache.has(roleId)) {
            maxFriends += limit;
        }
    }

    return maxFriends;
}

