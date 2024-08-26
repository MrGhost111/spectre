const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../data/channels.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('viewchannel')
        .setDescription('Admin command to view channel info')
        .addUserOption(option => option.setName('user').setDescription('User to view the channel of'))
        .addChannelOption(option => option.setName('channel').setDescription('Text channel to view')),
    async execute(interaction) {
        // Check for admin permissions
        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            return interaction.reply({
                content: 'This command is only available to admins.',
                ephemeral: true
            });
        }

        const user = interaction.options.getUser('user');
        const channel = interaction.options.getChannel('channel');
        const channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

        let userChannel;
        if (user) {
            userChannel = Object.values(channelsData).find(ch => ch.userId === user.id);
        } else if (channel) {
            userChannel = Object.values(channelsData).find(ch => ch.channelId === channel.id);
        } else {
            return interaction.reply({
                content: 'Please pick a user or channel.',
                ephemeral: true
            });
        }

        if (!userChannel) {
            return interaction.reply({
                content: 'No channel found for the specified user or channel.',
                ephemeral: true
            });
        }

        const channelInfo = interaction.guild.channels.cache.get(userChannel.channelId);
        if (!channelInfo) {
            return interaction.reply({
                content: 'Channel not found or it may have been deleted.',
                ephemeral: true
            });
        }

        // Determine owner status
        let ownerStatus;
        try {
            const owner = await interaction.guild.members.fetch(userChannel.userId);
            ownerStatus = `<@${userChannel.userId}>`;
        } catch (error) {
            // Owner not in the server
            ownerStatus = `${userChannel.userId} (left the server)`;
        }

        // Calculate the maximum number of friends
        const maxFriends = calculateMaxFriends(interaction.member);
        const currentFriendsCount = userChannel.friends.length;

        // Define role thresholds
        const roleThresholds = [
            { id: '768448955804811274', limit: 5 },
            { id: '768449168297033769', limit: 5 },
            { id: '946729964328337408', limit: 5 },
            { id: '1028256286560763984', limit: 2 },
            { id: '1028256279124250624', limit: 3 },
            { id: '1038106794200932512', limit: 5 },
        ].map(role => {
            const hasRole = interaction.member.roles.cache.has(role.id);
            const emoji = hasRole ? '<a:tick:1276746433495830620>' : '<a:crossmark:1276746067026903061>';
            return `${emoji} <@&${role.id}> ${role.limit}`;
        }).join('\n');

        // Prepare the friends list
        const friendsList = userChannel.friends.length > 0
            ? userChannel.friends.map(id => `<@${id}>`).join(', ')
            : 'No friends in the channel.';

        // Create the embed
        const embed = new EmbedBuilder()
            .setTitle('Channel Information')
            .setDescription(
                `<:invisible:1277372701710749777>\n**Channel:** <#${channelInfo.id}>\n\n` +
                `**Owner:** ${ownerStatus}\n\n` +
                `**Created On:** <t:${Math.floor(channelInfo.createdTimestamp / 1000)}:D>\n\n` +
                `**Friends:** ${currentFriendsCount}/${maxFriends}\n\n` +
                `**Invited Friends:**\n${friendsList}\n\n` +
                `**Role Thresholds:**\n${roleThresholds}`
            )
            .setColor(ownerStatus.includes('(left the server)') ? Colors.Red : Colors.Green);

        await interaction.reply({ embeds: [embed] });
    }
};

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
    let totalLimit = 0;
    for (const roleId in roleLimits) {
        if (member.roles.cache.has(roleId)) {
            totalLimit += roleLimits[roleId];
        }
    }
    return totalLimit;
}
