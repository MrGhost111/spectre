const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');

module.exports = {
    name: 'guess',
    description: 'Starts a guessing game with audio playback.',
    async execute(message) {
        // Check if the user is in a voice channel
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply('You need to be in a voice channel to use this command!');
        }

        // Join the user's voice channel
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });

        // Create an embed with a play button
        const guessEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Guess the Sound')
            .setDescription('Click the play button to hear the sound and start guessing!')
            .setTimestamp();

        const playButton = new ButtonBuilder()
            .setCustomId('play_audio')
            .setLabel('Play')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(playButton);

        // Send the embed with the button
        await message.channel.send({ embeds: [guessEmbed], components: [row] });

        // Listen for the audio completion and provide replay/answer options
        message.client.audioPlayer.once('stateChange', async (oldState, newState) => {
            if (newState.status === 'idle') {
                const replayButton = new ButtonBuilder()
                    .setCustomId('replay_audio')
                    .setLabel('Replay')
                    .setStyle(ButtonStyle.Secondary);

                const answerButton = new ButtonBuilder()
                    .setCustomId('submit_answer')
                    .setLabel('Answer')
                    .setStyle(ButtonStyle.Success);

                const actionRow = new ActionRowBuilder().addComponents(replayButton, answerButton);

                const afterEmbed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('What would you like to do next?')
                    .setDescription('You can either replay the sound or submit your answer.')
                    .setTimestamp();

                await message.channel.send({ embeds: [afterEmbed], components: [actionRow] });
            }
        });
    },
};
