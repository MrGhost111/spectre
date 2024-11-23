const fs = require('fs');
const path = require('path');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const dataPath = path.join(__dirname, '../data/ltl-events.json');
const LTL_CHANNEL_ID = '944924720158085190';

// Initialize data file if it doesn't exist
if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, JSON.stringify({}, null, 2));
}

module.exports = {
    name: 'l2l',
    description: 'Unlocks the Last to Leave voice channel and prepares for event start',
    async execute(message, args) {
        // Check if user has the required role
        const requiredRole = '712970141834674207'; // Replace with actual role ID
        if (!message.member.roles.cache.has(requiredRole)) {
            return message.reply('You do not have permission to manage Last to Leave events.');
        }

        const voiceChannel = message.guild.channels.cache.get(LTL_CHANNEL_ID);
        if (!voiceChannel || voiceChannel.type !== 2) { // 2 is the type for voice channels
            return message.reply('Could not find the Last to Leave voice channel.');
        }

        try {
            // Read current events data
            const eventsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

            // Check if there's already an active event
            if (eventsData[voiceChannel.id]) {
                return message.reply('There is already an active Last to Leave event in this channel.');
            }

            // Create new event data
            const eventData = {
                channelId: voiceChannel.id,
                status: 'waiting', // waiting -> active -> completed
                startTime: null, // Will be set when locked
                participants: {},
                statusMessageId: null,
                logChannelId: message.channel.id // Using current channel for logs
            };

            // Update permissions to allow everyone to join
            await voiceChannel.permissionOverwrites.edit(message.guild.roles.everyone.id, {
                [PermissionFlagsBits.Connect]: true,
                [PermissionFlagsBits.Speak]: true,
                [PermissionFlagsBits.UseVAD]: true
            });

            // Also give basic permissions to the bot
            await voiceChannel.permissionOverwrites.edit(message.guild.members.me.id, {
                [PermissionFlagsBits.ViewChannel]: true,
                [PermissionFlagsBits.Connect]: true,
                [PermissionFlagsBits.Speak]: true,
                [PermissionFlagsBits.MuteMembers]: true,
                [PermissionFlagsBits.DeafenMembers]: true,
                [PermissionFlagsBits.ManageChannels]: true
            });

            // Create initial status embed
            const statusEmbed = new EmbedBuilder()
                .setTitle('Last to Leave Event - Waiting to Start')
                .setDescription('The voice channel is now unlocked. Participants can join.\nThe event will begin when the host uses the lock command.')
                .setColor('#00FF00')
                .setTimestamp()
                .setFooter({ text: 'Use !ltlstart to start the event' });

            const statusMessage = await message.channel.send({ embeds: [statusEmbed] });
            eventData.statusMessageId = statusMessage.id;

            // Save event data
            eventsData[voiceChannel.id] = eventData;
            fs.writeFileSync(dataPath, JSON.stringify(eventsData, null, 2));

            return message.reply(`Voice channel <#${LTL_CHANNEL_ID}> unlocked and ready for participants!`);
        } catch (error) {
            console.error(error);
            return message.reply('An error occurred while setting up the event.');
        }
    }
};
