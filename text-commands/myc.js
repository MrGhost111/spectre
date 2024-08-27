const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const dataPath = './data/channels.json'; // Path to channels.json

module.exports = {
    name: 'myc',
    async execute(message, args) {
        // Role check
        const requiredRoles = ['768448955804811274', '1038106794200932512'];
        if (!message.member.roles.cache.some(role => requiredRoles.includes(role.id))) {
            return message.reply({ content: 'You do not have the required role to run this command.', allowedMentions: { repliedUser: false } });
        }

        // Read channels data from channels.json
        let channels;
        try {
            const data = fs.readFileSync(dataPath, 'utf8');
            channels = JSON.parse(data);

            // Ensure channels is an object
            if (typeof channels !== 'object' || channels === null) {
                throw new Error('Channels data is not an object');
            }
        } catch (error) {
            console.error('Error reading channels data:', error);
            return message.reply({ content: 'There was an error reading the channels data.', allowedMentions: { repliedUser: false } });
        }

        // Check if the user has a channel
        const userChannel = channels[message.author.id];

        if (userChannel) {
            // Fetch the channel object from Discord
            let channel;
            try {
                channel = await message.client.channels.fetch(userChannel.channelId);
            } catch (error) {
                console.error('Error fetching channel:', error);
                return message.reply({ content: 'There was an error fetching the channel.', allowedMentions: { repliedUser: false } });
            }

            // Calculate max friends
            const maxFriends = calculateMaxFriends(message.member);

            // Define roles and their limits
            const roles = [
                { id: '768448955804811274', limit: 5 },
                { id: '768449168297033769', limit: 5 },
                { id: '946729964328337408', limit: 5 },
                { id: '1028256286560763984', limit: 2 },
                { id: '1028256279124250624', limit: 3 },
                { id: '1038106794200932512', limit: 5 },
            ];

            // Generate role thresholds
            const roleThresholds = roles.map(role => {
                const hasRole = message.member.roles.cache.has(role.id);
                const emoji = hasRole ? '<a:tick:1276746433495830620>' : '<a:crossmark:1276746067026903061>';
                return `${emoji} <@&${role.id}> ${role.limit}`;
            }).join('\n');

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('Channel Information')
                .setDescription(
                    `**Channel:** <#${userChannel.channelId}>\n\n` +
                    `**Owner:** <@${message.author.id}>\n\n` +
                    `**Created On:** <t:${Math.floor(channel.createdTimestamp / 1000)}:D>\n\n` +
                    `**Invited Friends:** ${userChannel.friends.length} / ${maxFriends}\n\n` +
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
                        .setEmoji('<:user:1273754877646082048>')  // Use setEmoji() for custom emoji
                );

            await message.reply({ embeds: [embed], components: [row], allowedMentions: { repliedUser: false } });
        } else {
            // User does not have a channel
            const embed = new EmbedBuilder()
                .setTitle('Create a Channel')
                .setDescription('You do not own a channel. Click the button below to create one.')
                .setColor('#FF0000');

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('create_channel')
                        .setLabel('Create Channel')
                        .setStyle(ButtonStyle.Success)
                );

            await message.reply({ embeds: [embed], components: [row], allowedMentions: { repliedUser: false } });
        }
    },
};

// Helper function to calculate max friends
function calculateMaxFriends(member) {
    const roles = [
        { id: '768448955804811274', limit: 5 },
        { id: '768449168297033769', limit: 5 },
        { id: '946729964328337408', limit: 5 },
        { id: '1028256286560763984', limit: 2 },
        { id: '1028256279124250624', limit: 3 },
        { id: '1038106794200932512', limit: 5 },
    ];

    let maxFriends = 0;
    roles.forEach(role => {
        if (member.roles.cache.has(role.id)) {
            maxFriends += role.limit;
        }
    });

    return maxFriends;
}

