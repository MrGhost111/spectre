const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const dataPath = './data/channels.json';

module.exports = {
    name: 'myc',
    async execute(message, args) {
        const requiredRoles = [
            '768448955804811274',
            '768449168297033769',
            '946729964328337408',
            '1028256286560763984',
            '1028256279124250624',
            '1038106794200932512'
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

            const roles = [
                { id: '768448955804811274', limit: 5 },
                { id: '768449168297033769', limit: 5 },
                { id: '946729964328337408', limit: 5 },
                { id: '1028256286560763984', limit: 5 },
                { id: '1028256279124250624', limit: 5 },
                { id: '1038106794200932512', limit: 5 },
            ];

            const roleThresholds = roles.map(role => {
                const hasRole = message.member.roles.cache.has(role.id);
                const emoji = hasRole ? '<a:tick:1276746433495830620>' : '<a:crossmark:1276746067026903061>';
                return `${emoji} <@&${role.id}> ${role.limit}`;
            }).join('\n');

            const { responses, updatedFriends, friendsChanged } = await ensureFriendsInChannel(userChannel.friends, channel, maxFriends);
            const currentFriendsCount = friendsChanged ? updatedFriends.length : userChannel.friends.length;

            const embed = new EmbedBuilder()
                .setTitle('Channel Information')
                .setDescription(
                    `**Channel:** <#${userChannel.channelId}>\n\n` +
                    `**Owner:** <@${message.author.id}>\n\n` +
                    `**Created On:** <t:${Math.floor(channel.createdTimestamp / 1000)}:D>\n\n` +
                    `**Invited Friends:** ${currentFriendsCount} / ${maxFriends}\n\n` +
                    `**Role Thresholds:**\n${roleThresholds}`
                )
                .setFooter({ text: `Channel Owner ID: ${userChannel.userId}` })
                .setColor(0x6666ff);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('rename_channel')
                        .setLabel('Rename Channel')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('view_friends')
                        .setLabel('View Friends')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('<:user:1273754877646082048>')
                );

            await message.reply({ embeds: [embed], components: [row] });

            if (responses.length > 0) {
                await message.channel.send(responses.join('\n'));
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
            await message.reply({ embeds: [embed], components: [row] });
        }
    }
}

async function ensureFriendsInChannel(friends, channel, maxFriends) {
    const responses = [];
    let currentFriendsCount = 0;
    const updatedFriends = [];
    let friendsChanged = false;

    for (const friendId of friends) {
        try {
            const member = await channel.guild.members.fetch(friendId);
            
            if (member) {
                if (!channel.permissionOverwrites.cache.has(friendId)) {
                    if (currentFriendsCount >= maxFriends) {
                        responses.push(`Couldn't add <@${friendId}> back to the channel - max friends limit (${maxFriends}) reached.`);
                        continue;
                    }

                    try {
                        await channel.permissionOverwrites.create(friendId, {
                            [PermissionsBitField.Flags.ViewChannel]: true,
                        });
                        responses.push(`Added <@${friendId}> back to the channel.`);
                    } catch (error) {
                        console.error('Error creating permission overwrite:', error);
                        responses.push(`Failed to add <@${friendId}> back to the channel.`);
                        continue;
                    }
                }
                
                currentFriendsCount++;
                updatedFriends.push(friendId);
            } else {
                responses.push(`Removed <@${friendId}> from friends list - user no longer in server.`);
                friendsChanged = true;
            }
        } catch (error) {
            if (error.code === 10007) {
                responses.push(`Removed <@${friendId}> from friends list - user no longer in server.`);
                friendsChanged = true;
            } else {
                console.error('Error fetching member:', error);
                responses.push(`Error checking member <@${friendId}>.`);
                updatedFriends.push(friendId);
            }
        }
    }

    if (friendsChanged) {
        try {
            const data = fs.readFileSync(dataPath, 'utf8');
            const channels = JSON.parse(data);
            
            if (channels[channel.permissionOverwrites.cache.first().id]) {
                channels[channel.permissionOverwrites.cache.first().id].friends = updatedFriends;
                fs.writeFileSync(dataPath, JSON.stringify(channels, null, 2));
                responses.push('Friends list has been updated.');
            }
        } catch (error) {
            console.error('Error updating channels.json:', error);
            responses.push('Failed to update friends list in database.');
        }
    }

    return {
        responses,
        updatedFriends,
        friendsChanged
    };
}

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
