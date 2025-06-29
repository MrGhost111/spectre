const fs = require('fs');
const dataPath = './data/channels.json';

module.exports = {
    name: 'test',
    async execute(message, args) {
        const requiredRoles = [
            '768448955804811274', '768449168297033769', '946729964328337408',
            '1028256286560763984', '1028256279124250624', '1038106794200932512',
            '1038888209440067604', '783032959350734868', '1349716423706148894',
        ];

        if (!message.member.roles.cache.some(role => requiredRoles.includes(role.id))) {
            return message.reply({
                content: 'You do not have the required role to run this command.',
                allowedMentions: { repliedUser: false }
            });
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
            return message.reply({
                content: 'There was an error reading the channels data.',
                allowedMentions: { repliedUser: false }
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
                    allowedMentions: { repliedUser: false }
                });
            }

            const maxFriends = calculateMaxFriends(message.member);

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
                const emoji = hasRole ? '<a:tick:1276746433495830620>' : '<a:crossmark:1276746067026903061>';
                return `${emoji} <@&${role.id}> ${role.limit}`;
            }).join('\n');

            const currentFriendsCount = userChannel.friends.length;

            const channelInfo = {
                flags: 32768,
                components: [
                    {
                        type: 17,
                        accent_color: 0x6666ff,
                        components: [
                            {
                                type: 10,
                                content:
                                    `**Channel:** <#${userChannel.channelId}>\n` +
                                    `**Owner:** <@${message.author.id}>\n` +
                                    `**Created On:** <t:${Math.floor(channel.createdTimestamp / 1000)}:D>\n` +
                                    `**Invited Friends:** ${currentFriendsCount} / ${maxFriends}`
                            },
                            {
                                type: 10,
                                content: `**Role Thresholds:**\n${roleThresholds}`
                            },
                            {
                                type: 10,
                                content: `**Use </addfriends:1287658557713678389> and </removefriends:1287658557713678395> to manage the channel members**`
                            },
                            {
                                type: 1,
                                components: [
                                    {
                                        type: 2,
                                        custom_id: 'rename_channel',
                                        label: 'Rename Channel',
                                        style: 2
                                    },
                                    {
                                        type: 2,
                                        custom_id: 'view_friends',
                                        label: 'View Friends',
                                        style: 2,
                                        emoji: {
                                            id: '1273754877646082048',
                                            name: 'user'
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                ]
            };

            await message.reply(channelInfo);

        } else {
            await message.reply({
                components: [
                    {
                        type: 17,
                        accent_color: 0xFF0000,
                        components: [
                            {
                                type: 10,
                                content: '**No Channel Found**\nYou do not own any channel. Would you like to create one?'
                            },
                            {
                                type: 1,
                                components: [
                                    {
                                        type: 2,
                                        custom_id: 'create_channel',
                                        label: 'Create Channel',
                                        style: 1
                                    }
                                ]
                            }
                        ]
                    }
                ]
            });
        }
    }
};

function calculateMaxFriends(member) {
    const roleLimits = {
        '768448955804811274': 5, '768449168297033769': 5, '946729964328337408': 5,
        '1028256286560763984': 5, '1028256279124250624': 5, '1038106794200932512': 5,
        '1038888209440067604': 5, '783032959350734868': 10, '1349716423706148894': 5
    };

    return Object.entries(roleLimits).reduce((sum, [roleId, limit]) => {
        return member.roles.cache.has(roleId) ? sum + limit : sum;
    }, 0);
}