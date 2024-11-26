const fs = require('fs');
const path = require('path');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const dataPath = path.join(__dirname, '../data/ltl-events.json');
const HOST_ROLE_ID = '712970141834674207';
const VOICE_CHANNEL_ID = '944924720158085190';

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
            const eventsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

            if (eventsData[voiceChannel.id] && eventsData[voiceChannel.id].status === 'active') {
                return message.reply('There is already an active Last to Leave event in this channel.');
            }

            const eventData = {
                status: 'waiting',
                logChannelId: message.channel.id
            };

            await voiceChannel.permissionOverwrites.edit(message.guild.roles.everyone.id, {
                [PermissionFlagsBits.Connect]: true,
                [PermissionFlagsBits.Speak]: true,
                [PermissionFlagsBits.UseVAD]: true
            });

            const statusEmbed = new EmbedBuilder()
                .setTitle('<:YJ_streak:1259258046924853421> Last to Leave Event - Waiting to Start')
                .setDescription('
                     'Event Setup Complete!'+
                    'The voice channel is now unlocked and ready for participants.'+
                    'The event will begin when the host uses ,start')
                .setColor('#6666ff')
                .setTimestamp()

            const statusMessage = await message.channel.send({ embeds: [statusEmbed] });
            eventData.statusMessageId = statusMessage.id;
            eventsData[voiceChannel.id] = eventData;
            fs.writeFileSync(dataPath, JSON.stringify(eventsData, null, 2));

            return message.reply(`Event setup complete! Voice channel ${voiceChannel} is now unlocked.`);
        } catch (error) {
            console.error(error);
            return message.reply('An error occurred while setting up the event.');
        }
    }
};
