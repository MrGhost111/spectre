const fs = require('fs');
const path = require('path');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const dataPath = path.join(__dirname, '../data/ltl-events.json');
const LTL_CHANNEL_ID = '944924720158085190';
const HOST_ROLE_ID = '712970141834674207';

function formatDuration(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));

    let duration = '';
    if (days > 0) duration += `${days}d `;
    if (hours > 0) duration += `${hours}h `;
    if (minutes > 0) duration += `${minutes}m `;
    duration += `${seconds}s`;

    return duration;
}

module.exports = {
    name: 'start',
    description: 'Locks the Last to Leave voice channel and starts the event',
    async execute(message, args) {
        // Check if user has the required role
        if (!message.member.roles.cache.has(HOST_ROLE_ID)) {
            return message.reply('You do not have permission to manage Last to Leave events.');
        }

        const voiceChannel = message.guild.channels.cache.get(LTL_CHANNEL_ID);
        if (!voiceChannel || voiceChannel.type !== 2) {
            return message.reply('Could not find the Last to Leave voice channel.');
        }

        try {
            // Read current events data
            const eventsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

            // Check if there's an active event in waiting status
            if (!eventsData[voiceChannel.id] || eventsData[voiceChannel.id].status !== 'waiting') {
                return message.reply('No active event found in waiting status for this channel.');
            }

            const eventData = eventsData[voiceChannel.id];

            // Get all current participants in the voice channel
            const currentParticipants = voiceChannel.members;
            if (currentParticipants.size < 2) {
                return message.reply('Need at least 2 participants to start the event.');
            }

            // Update event data
eventData.status = 'active';
eventData.startTime = Date.now();
eventData.participants = {}; // Initialize the participants object first

currentParticipants.forEach(member => {
    eventData.participants[member.id] = {
        username: member.user.username,
        joinTime: Date.now(),
        leaveTime: null,
        status: 'active',
        rank: null
    };
});

            // Lock the channel
            await voiceChannel.permissionOverwrites.edit(message.guild.roles.everyone.id, {
                [PermissionFlagsBits.Connect]: false,
                [PermissionFlagsBits.Speak]: true,
                [PermissionFlagsBits.UseVAD]: true
            });

            // Keep bot permissions
            await voiceChannel.permissionOverwrites.edit(message.guild.members.me.id, {
                [PermissionFlagsBits.ViewChannel]: true,
                [PermissionFlagsBits.Connect]: true,
                [PermissionFlagsBits.Speak]: true,
                [PermissionFlagsBits.MuteMembers]: true,
                [PermissionFlagsBits.DeafenMembers]: true,
                [PermissionFlagsBits.ManageChannels]: true
            });

            // Create status embed with updated format
            const statusEmbed = new EmbedBuilder()
                .setTitle('<:power:1064835342160625784>  Last to Leave Event - Active')
                .setDescription(`Event Started: <t:${Math.floor(Date.now() / 1000)}:F>`)
                .setColor('#FF0000')
                .setTimestamp()
                .addFields(
                    { name: '<:time:1000024854478721125>  Event Duration', value: '0s', inline: false },
                    { name: '<:user:1273754877646082048>  Participants Remaining', value: `${currentParticipants.size}/${Object.keys(eventData.participants).length}`, inline: false }
                );

            // Add participant list with proper formatting
            let participantsList = '';
            Object.values(eventData.participants).forEach(participant => {
                participantsList += `<a:tick:1276746433495830620> ${participant.username} (Active)\n`;
            });

            statusEmbed.addFields({ 
                name: '<:user:1273754877646082048>  Participants Status', 
                value: participantsList || 'No participants'
            });

            // Update status message
            const statusMessage = await message.channel.messages.fetch(eventData.statusMessageId);
            await statusMessage.edit({ embeds: [statusEmbed] });

            // Save event data
            eventsData[voiceChannel.id] = eventData;
            fs.writeFileSync(dataPath, JSON.stringify(eventsData, null, 2));

            return message.reply(`Event started! The voice channel <#${LTL_CHANNEL_ID}> has been locked.`);
        } catch (error) {
            console.error(error);
            return message.reply('An error occurred while starting the event.');
        }
    }
};
