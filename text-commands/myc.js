const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle } = require('discord.js');
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
    name: 'myc',
    async execute(message, args) {
        const requiredRoles = Object.keys(ROLE_CONFIG);

        if (!message.member.roles.cache.some(role => requiredRoles.includes(role.id))) {
            return message.reply({
                content: 'You do not have the required role to run this command.',
                allowedMentions: { repliedUser: false },
            });
        }

        let channels;
        try {
            channels = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            if (typeof channels !== 'object' || channels === null) throw new Error('Invalid data');
        } catch (error) {
            console.error('Error reading channels data:', error);
            return message.reply({
                content: 'There was an error reading the channels data.',
                allowedMentions: { repliedUser: false },
            });
        }

        const userChannel = channels[message.author.id];

        if (userChannel) {
            let channel;
            try {
                channel = await message.client.channels.fetch(userChannel.channelId);
            } catch (error) {
                console.error('Error fetching channel:', error);
                return message.reply({
                    content: 'There was an error fetching the channel.',
                    allowedMentions: { repliedUser: false },
                });
            }

            const maxFriends = calculateMaxFriends(message.member);

            // Notify about friends who have left — do NOT modify the list
            const leftNotices = [];
            for (const friendId of userChannel.friends) {
                const member = await message.guild.members.fetch(friendId).catch(() => null);
                if (!member) {
                    leftNotices.push(`<@${friendId}> has left the server. They will be re-added if they rejoin.`);
                }
            }

            const roleThresholds = Object.entries(ROLE_CONFIG).map(([roleId, config]) => {
                const hasRole = message.member.roles.cache.has(roleId);
                const emoji = hasRole ? '<a:tick:1276746433495830620>' : '<a:crossmark:1276746067026903061>';
                return `${emoji} <@&${roleId}> ${config.limit}`;
            }).join('\n');

            const embed = new EmbedBuilder()
                .setTitle('Channel Information')
                .setDescription(
                    `**Channel:** <#${userChannel.channelId}>\n\n` +
                    `**Owner:** <@${message.author.id}>\n\n` +
                    `**Created On:** <t:${Math.floor(channel.createdTimestamp / 1000)}:D>\n\n` +
                    `**Invited Friends:** ${userChannel.friends.length} / ${maxFriends}\n\n` +
                    `**Role Thresholds:**\n${roleThresholds}\n\n` +
                    `**Use </addfriends:1287658557713678389> and </removefriends:1287658557713678395> to manage the channel members**`
                )
                .setFooter({ text: `Channel Owner ID: ${userChannel.userId}` })
                .setColor(0x6666ff);

            const isOwner = message.author.id === userChannel.userId;

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('rename_channel')
                    .setLabel('Rename Channel')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(!isOwner),
                new ButtonBuilder()
                    .setCustomId('view_friends')
                    .setLabel('View Friends')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('<:user:1273754877646082048>')
                    .setDisabled(!isOwner),
            );

            await message.reply({
                embeds: [embed],
                components: [row],
                allowedMentions: { repliedUser: false },
            });

            if (leftNotices.length > 0) {
                await message.reply({
                    content: leftNotices.join('\n'),
                    allowedMentions: { parse: [] },
                });
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
            await message.reply({
                embeds: [embed],
                components: [row],
                allowedMentions: { repliedUser: false },
            });
        }
    },
};

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