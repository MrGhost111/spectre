const fs = require('fs');
const path = require('path');
const { PermissionFlagsBits } = require('discord.js');
const { createStatusEmbed } = require('../utils/helpers');

const dataPath = path.join(__dirname, '../data/ltl-events.json');
const VOICE_CHANNEL_ID = '944924720158085190';
const HOST_ROLE_ID = '712970141834674207';

if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, JSON.stringify({}, null, 2));
}

module.exports = {
    name: 'l2l',
    async execute(message, args) {
        if (!message.member.roles.cache.has(HOST_ROLE_ID)) {
            return message.reply('You do not have permission to manage Last to Leave events.');
        }

        const voiceChannel = message.guild.channels.cache.get(VOICE_CHANNEL_ID);
        if (!voiceChannel) {
            return message.reply('The configured voice channel could not be found.');
        }

        try {
            // Clear existing event data
            fs.writeFileSync(dataPath, JSON.stringify({}, null, 2));

            const eventData = {
                status: 'waiting',
                logChannelId: message.channel.id,
                participants: {}
            };

            // Unlock the voice channel
            await voiceChannel.permissionOverwrites.edit(message.guild.roles.everyone.id, {
                [PermissionFlagsBits.Connect]: true,
                [PermissionFlagsBits.Speak]: true,
                [PermissionFlagsBits.UseVAD]: true
            });

            const { embed } = await createStatusEmbed(eventData);
            const statusMessage = await message.channel.send({ embeds: [embed] });
            eventData.statusMessageId = statusMessage.id;

            const eventsData = {};
            eventsData[voiceChannel.id] = eventData;
            fs.writeFileSync(dataPath, JSON.stringify(eventsData, null, 2));

            return message.reply(`Event setup complete! Voice channel ${voiceChannel} is now unlocked.`);
        } catch (error) {
            console.error(error);
            return message.reply('An error occurred while setting up the event.');
        }
    }
};
