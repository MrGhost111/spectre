const fs = require('fs');
const path = require('path');
const { PermissionFlagsBits } = require('discord.js');
const { createStatusEmbed } = require('../utils/helpers');

const dataPath = path.join(__dirname, '../data/ltl-events.json');
const VOICE_CHANNEL_ID = '944924720158085190';
const HOST_ROLE_ID = '712970141834674207';

module.exports = {
    name: 'start',
    async execute(message, args) {
        if (!message.member.roles.cache.has(HOST_ROLE_ID)) {
            return message.reply('You do not have permission to manage Last to Leave events.');
        }

        const voiceChannel = message.guild.channels.cache.get(VOICE_CHANNEL_ID);
        if (!voiceChannel || voiceChannel.type !== 2) {
            return message.reply('Could not find the Last to Leave voice channel.');
        }

        try {
            const eventsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            
            const eventData = {
                status: 'active',
                startTime: Date.now(),
                logChannelId: message.channel.id,
                participants: {}
            };

            const currentParticipants = voiceChannel.members;

            // Register all current participants
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

            // Ensure bot permissions
            await voiceChannel.permissionOverwrites.edit(message.guild.members.me.id, {
                [PermissionFlagsBits.ViewChannel]: true,
                [PermissionFlagsBits.Connect]: true,
                [PermissionFlagsBits.Speak]: true,
                [PermissionFlagsBits.MuteMembers]: true,
                [PermissionFlagsBits.DeafenMembers]: true,
                [PermissionFlagsBits.ManageChannels]: true
            });

            // Create and send status embed
            const { embed } = await createStatusEmbed(eventData);
            const statusMessage = await message.channel.send({ embeds: [embed] });
            eventData.statusMessageId = statusMessage.id;

            // Save event data
            eventsData[voiceChannel.id] = eventData;
            fs.writeFileSync(dataPath, JSON.stringify(eventsData, null, 2));

            return message.reply(`Event started! The voice channel <#${VOICE_CHANNEL_ID}> has been locked with ${currentParticipants.size} participants.`);
        } catch (error) {
            console.error(error);
            return message.reply('An error occurred while starting the event.');
        }
    }
};
