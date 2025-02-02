const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const audioFolderPath = path.join(__dirname, '../../audio'); // Path to your audio folder

module.exports = {
    name: 'guess',
    async execute(message) {
        const voiceChannel = message.member.voice.channel;

        // Debugging: Log the voiceChannel object
        console.log('Voice Channel:', voiceChannel);

        if (!voiceChannel) {
            return message.reply('You need to be in a voice channel to use this command!');
        }

        // Check if the voice channel is in the same guild (server)
        if (voiceChannel.guild.id !== message.guild.id) {
            return message.reply('You must be in a voice channel in this server!');
        }

        try {
            // Join the voice channel
            const connection = await voiceChannel.join();

            // Create the embed with buttons
            const embed = new EmbedBuilder()
                .setTitle('Guess the Sound')
                .setDescription('Press "Play New" to start!');

            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('play_new')
                        .setLabel('Play New')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('replay')
                        .setLabel('Replay')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('answer')
                        .setLabel('Answer')
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(true)
                );

            const playerMessage = await message.channel.send({ embeds: [embed], components: [buttons] });

            // Store the player message ID and connection in a global object
            global.playerStates = global.playerStates || {};
            global.playerStates[playerMessage.id] = {
                connection,
                currentClip: null,
                isPlaying: false,
                buttons,
                embed,
                playerMessage
            };
        } catch (error) {
            console.error('Error executing command guess:', error);
            message.reply('An error occurred while trying to join the voice channel.');
        }
    }
};
