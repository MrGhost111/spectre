const fs = require('fs');
const path = require('path');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const dataPath = path.join(__dirname, '../data/ltl-events.json');
const HOST_ROLE_ID = '712970141834674207';

module.exports = {
    name: 'start',
    async execute(message, args) {
        if (!message.member.roles.cache.has(HOST_ROLE_ID)) {
            return message.reply('You do not have permission to manage Last to Leave events.');
        }

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply('Please join a voice channel first!');
        }

        try {
            const eventsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            
            if (eventsData[voiceChannel.id] && eventsData[voiceChannel.id].status === 'active') {
                return message.reply('There is already an active event in this channel. Use `,end` to end it first.');
            }

            const currentParticipants = voiceChannel.members;
            if (currentParticipants.size < 2) {
                return message.reply('Need at least 2 participants to start the event.');
            }

            const eventData = {
                status: 'active',
                startTime: Date.now(),
                logChannelId: message.channel.id,
                participants: {}
            };

            currentParticipants.forEach(member => {
                eventData.participants[member.id] = {
                    username: member.user.username,
                    joinTime: Date.now(),
                    leaveTime: null,
                    status: 'active'
                };
            });

            await voiceChannel.permissionOverwrites.edit(message.guild.roles.everyone.id, {
                [PermissionFlagsBits.Connect]: false,
                [PermissionFlagsBits.Speak]: true,
                [PermissionFlagsBits.UseVAD]: true
            });

            const statusEmbed = new EmbedBuilder()
                .setTitle('🎮 Last to Leave Event - Active')
                .setDescription(`Event Started: <t:${Math.floor(eventData.startTime / 1000)}:F>`)
                .setColor('#FF0000')
                .setTimestamp()
                .addFields(
                    { name: '⏱️ Event Duration', value: '0s', inline: true },
                    { name: '👥 Participants', value: `${currentParticipants.size}`, inline: true }
                );

            const statusMessage = await message.channel.send({ embeds: [statusEmbed] });
            eventData.statusMessageId = statusMessage.id;

            eventsData[voiceChannel.id] = eventData;
            fs.writeFileSync(dataPath, JSON.stringify(eventsData, null, 2));

            return message.reply('🎉 Event started! The voice channel has been locked. Good luck to all participants!');
        } catch (error) {
            console.error(error);
            return message.reply('An error occurred while starting the event.');
        }
    }
};
