const {
    SectionBuilder,
    TextDisplayBuilder,
    ButtonBuilder,
    SeparatorBuilder,
    MessageFlags,
    ButtonStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const dataPath = './data/channels.json';

module.exports = {
    name: 'test',
    async execute(message, args) {
        const requiredRoles = [
            '768448955804811274',
            '768449168297033769',
            '946729964328337408',
            '1028256286560763984',
            '1028256279124250624',
            '1038106794200932512',
            '1038888209440067604',
            '783032959350734868',
            '1349716423706148894'
        ];

        if (!message.member.roles.cache.some(role => requiredRoles.includes(role.id))) {
            return message.reply({ content: 'You do not have the required role to run this command.', allowedMentions: { repliedUser: false } });
        }

        let channels;
        try {
            const data = fs.readFileSync(dataPath, 'utf8');
            channels = JSON.parse(data);
            if (typeof channels !== 'object' || channels === null) {
                throw new Error('Channels data is not an object');
            }
        } catch (error) {
            console.error('Error reading channels data:', error);
            return message.reply({ content: 'There was an error reading the channels data.', allowedMentions: { repliedUser: false } });
        }

        const userChannel = channels[message.author.id];

        if (userChannel) {
            let channel;
            try {
                channel = await message.client.channels.fetch(userChannel.channelId);
            } catch (error) {
                console.error('Error fetching channel:', error);
                return message.reply({ content: 'There was an error fetching the channel.', allowedMentions: { repliedUser: false } });
            }

            const maxFriends = calculateMaxFriends(message.member);
            const currentFriendsCount = userChannel.friends.length;

            const roles = [
                { id: '768448955804811274', limit: 5 },
                { id: '768449168297033769', limit: 5 },
                { id: '946729964328337408', limit: 5 },
                { id: '1028256286560763984', limit: 5 },
                { id: '1028256279124250624', limit: 5 },
                { id: '1038106794200932512', limit: 5 },
                { id: '1038888209440067604', limit: 5 },
                { id: '783032959350734868', limit: 10 },
                { id: '1349716423706148894', limit: 5 }
            ];

            const roleThresholds = roles.map(role => {
                const hasRole = message.member.roles.cache.has(role.id);
                const emoji = hasRole ? '✅' : '❌';
                return `${emoji} <@&${role.id}> ${role.limit}`;
            }).join('\n');

            const section1 = new SectionBuilder().addTextDisplayComponents(td =>
                td.setContent(
                    `**Channel:** <#${userChannel.channelId}>\n` +
                    `**Owner:** <@${message.author.id}>\n` +
                    `**Created On:** <t:${Math.floor(channel.createdTimestamp / 1000)}:D>\n\n` +
                    `**Invited Friends:** ${currentFriendsCount} / ${maxFriends}\n\n` +
                    `**Role Thresholds:**\n${roleThresholds}`
                )
            );

            const actionSection = new SectionBuilder()
                .addTextDisplayComponents(td => td.setContent('Use the buttons below to manage your channel.'))
                .setButtonAccessory(btn =>
                    btn.setCustomId('rename_channel')
                        .setLabel('Rename Channel')
                        .setStyle(ButtonStyle.Secondary)
                )
                .addButtonAccessory(btn =>
                    btn.setCustomId('view_friends')
                        .setLabel('View Friends')
                        .setStyle(ButtonStyle.Secondary)
                );

            await message.reply({
                components: [section1, new SeparatorBuilder(), actionSection],
                flags: MessageFlags.IsComponentsV2
            });
        } else {
            const section = new SectionBuilder().addTextDisplayComponents(td =>
                td.setContent('You do not own any channel. Would you like to create one?')
            );

            const action = new SectionBuilder()
                .setButtonAccessory(btn =>
                    btn.setCustomId('create_channel')
                        .setLabel('Create Channel')
                        .setStyle(ButtonStyle.Primary)
                );

            await message.reply({
                components: [section, new SeparatorBuilder(), action],
                flags: MessageFlags.IsComponentsV2
            });
        }
    }
};

function calculateMaxFriends(member) {
    const roleLimits = {
        '768448955804811274': 5,
        '768449168297033769': 5,
        '946729964328337408': 5,
        '1028256286560763984': 5,
        '1028256279124250624': 5,
        '1038106794200932512': 5,
        '1038888209440067604': 5,
        '783032959350734868': 10,
        '1349716423706148894': 5
    };

    let maxFriends = 0;
    for (const [roleId, limit] of Object.entries(roleLimits)) {
        if (member.roles.cache.has(roleId)) {
            maxFriends += limit;
        }
    }
    return maxFriends;
}
