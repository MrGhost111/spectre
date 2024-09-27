const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const dataPath = './data/channels.json';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mychannel')
        .setDescription('Manage your channel'),
    async execute(interaction) {
        const requiredRoles = [
            '768448955804811274',
            '768449168297033769',
            '946729964328337408',
            '1028256286560763984',
            '1028256279124250624',
            '1038106794200932512'
        ];

        if (!interaction.member.roles.cache.some(role => requiredRoles.includes(role.id))) {
            return interaction.reply('You do not have the required role to run this command.');
        }

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

        // Check friends and ensure they're in the channel
        const responses = await ensureFriendsInChannel(userChannel.friends, channel, maxFriends);

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

        // Send response about added friends if any
        if (responses.length > 0) {
            await interaction.followUp({ content: responses.join('\n'), ephemeral: true });
        }

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

// Function to ensure all friends are in the channel and add if not
async function ensureFriendsInChannel(friends, channel, maxFriends) {
    const responses = [];
    let currentFriendsCount = friends.length;

    for (const friendId of friends) {
        if (!channel.permissionOverwrites.cache.has(friendId)) {
            // Check if adding this friend would exceed the max friends limit
            if (currentFriendsCount >= maxFriends) {
                responses.push(`Tried to add <@${friendId}> back to the channel, but the max friends limit has been reached.`);
                continue;
            }
            try {
                await channel.permissionOverwrites.create(friendId, {
                    [PermissionsBitField.Flags.ViewChannel]: true,
                });
                currentFriendsCount++; // Increment count after successful addition
                responses.push(`Added <@${friendId}> back to the channel.`);
            } catch (error) {
                console.error('Error creating permission overwrite:', error);
                responses.push(`Failed to add <@${friendId}> back to the channel.`);
            }
        }
    }

    return responses;
}

// Helper function to calculate the maximum number of friends based on roles
function calculateMaxFriends(member) {
    const roleLimits = {
        '768448955804811274': 5,
        '768449168297033769': 5,
        '946729964328337408': 5,
        '1028256286560763984': 5,
        '1028256279124250624': 5,
        '1038106794200932512': 5,
    };

    let maxFriends = 0;

    for (const [roleId, limit] of Object.entries(roleLimits)) {
        if (member.roles.cache.has(roleId)) {
            maxFriends += limit;
        }
    }

    return maxFriends;
}
