const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle } = require('discord.js');
const { createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, joinVoiceChannel } = require('@discordjs/voice');
const fs = require('fs');

const audioPath = '/home/ubuntu/spectre/audio/humpback_whale.mp3';

module.exports = {
    name: 'guess',
    description: 'Play an audio file in a voice channel',
    async execute(message) {
        const userId = message.author.id;

        // Check if the user is in a voice channel
        if (!message.member.voice.channel) {
            return message.reply({ content: 'You need to be in a voice channel to play audio!', ephemeral: true });
        }

        const voiceChannel = message.member.voice.channel;

        // Create the embed with the play button
        const embed = new EmbedBuilder()
            .setTitle('Guess the Sound')
            .setDescription('Click the button below to play the audio.')
            .setFooter({ text: `Requested by ${userId}` });

        const playButton = new ButtonBuilder()
            .setCustomId('play_audio')
            .setLabel('Play Audio')
            .setStyle(ButtonStyle.Secondary); // Use Secondary style

        const row = new ActionRowBuilder()
            .addComponents(playButton);

        await message.reply({ embeds: [embed], components: [row] });

        // Ensure the bot joins the voice channel when the command is executed
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });

        connection.on(VoiceConnectionStatus.Ready, () => {
            console.log('Connected to the voice channel');
        });

        connection.on('error', (error) => {
            console.error('Connection error:', error);
        });
    },

    async handleInteraction(interaction) {
        if (!interaction.isButton()) return;

        const userId = interaction.message.embeds[0].footer.text.split(' ')[2];

        if (interaction.customId === 'play_audio') {
            if (interaction.user.id !== userId) {
                return interaction.reply({ content: 'You are not authorized to use this button.', ephemeral: true });
            }

            if (!interaction.member.voice.channel) {
                return interaction.reply({ content: 'You need to be in a voice channel to play audio!', ephemeral: true });
            }

            if (!fs.existsSync(audioPath)) {
                return interaction.reply({ content: 'Audio file does not exist', ephemeral: true });
            }

            const voiceChannel = interaction.member.voice.channel;
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            });

            const audioPlayer = createAudioPlayer();
            const audioResource = createAudioResource(audioPath);

            connection.on(VoiceConnectionStatus.Ready, () => {
                console.log('Connected to the voice channel');

                audioPlayer.play(audioResource);
                console.log('Audio is playing');

                audioPlayer.on(AudioPlayerStatus.Idle, async () => {
                    await interaction.followUp({ content: 'Audio playback finished.', ephemeral: true });

                    const replayButton = new ButtonBuilder()
                        .setCustomId('replay_audio')
                        .setLabel('Replay')
                        .setStyle(ButtonStyle.Secondary) // Use Secondary style

                    const row = new ActionRowBuilder()
                        .addComponents(replayButton);

                    await interaction.followUp({ content: 'Click to replay the audio.', components: [row] });

                    connection.destroy();
                });

                audioPlayer.on('error', (error) => {
                    console.error('Error playing audio:', error);
                });

                connection.subscribe(audioPlayer);
            });

            connection.on('error', (error) => {
                console.error('Connection error:', error);
            });

            await interaction.reply({ content: 'Starting to play the audio...', ephemeral: true });
        } else if (interaction.customId === 'replay_audio') {
            if (interaction.user.id !== userId) {
                return interaction.reply({ content: 'You are not authorized to use this button.', ephemeral: true });
            }

            const disabledReplayButton = new ButtonBuilder()
                .setCustomId('replay_audio')
                .setLabel('Replay')
                .setStyle(ButtonStyle.Secondary) // Use Secondary style
                .setDisabled(true);

            const row = new ActionRowBuilder()
                .addComponents(disabledReplayButton);

            await interaction.update({ content: 'Replay button has been used.', components: [row] });

            if (!interaction.member.voice.channel) {
                return interaction.reply({ content: 'You need to be in a voice channel to replay audio!', ephemeral: true });
            }

            if (!fs.existsSync(audioPath)) {
                return interaction.reply({ content: 'Audio file does not exist', ephemeral: true });
            }

            const voiceChannel = interaction.member.voice.channel;
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            });

            const audioPlayer = createAudioPlayer();
            const audioResource = createAudioResource(audioPath);

            connection.on(VoiceConnectionStatus.Ready, () => {
                console.log('Connected to the voice channel');

                audioPlayer.play(audioResource);
                console.log('Audio is playing');

                audioPlayer.on(AudioPlayerStatus.Idle, async () => {
                    await interaction.followUp({ content: 'Audio playback finished.', ephemeral: true });
                    connection.destroy();
                });

                audioPlayer.on('error', (error) => {
                    console.error('Error playing audio:', error);
                });

                connection.subscribe(audioPlayer);
            });

            connection.on('error', (error) => {
                console.error('Connection error:', error);
            });

            await interaction.reply({ content: 'Starting to replay the audio...', ephemeral: true });
        }
    }
};
