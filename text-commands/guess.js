const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const path = require('path');
const fs = require('fs');
const sounds = require('../sounds.json'); // Load the sounds JSON

const audioDirectory = path.resolve(__dirname, '../audio'); // Path to the audio directory

module.exports = {
    name: 'guess',
    description: 'Starts a guessing game with a sound.',
    currentAudioFile: null, // Track the current audio file
    correctAnswers: [], // Store the correct answers for the current sound
    audioPlayer: null, // Keep track of the audio player

    async execute(message) {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply({ content: 'You need to be in a voice channel to play audio!' });
        }

        // Join the voice channel
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator,
        });

        // Set initial embed with buttons
        const playButton = new ButtonBuilder()
            .setCustomId('play_audio')
            .setLabel('Play New')
            .setStyle(ButtonStyle.Primary);

        const replayButton = new ButtonBuilder()
            .setCustomId('replay_audio')
            .setLabel('Replay')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true); // Initially disabled

        const answerButton = new ButtonBuilder()
            .setCustomId('submit_answer')
            .setLabel('Answer')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true); // Initially disabled

        const actionRow = new ActionRowBuilder().addComponents(playButton, replayButton, answerButton);

        const initialEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Guess the Sound')
            .setDescription('Click "Play New" to start.')
            .setTimestamp();

        await message.reply({ embeds: [initialEmbed], components: [actionRow] });
    },

    async handleInteraction(interaction) {
        if (interaction.isButton()) {
            if (interaction.customId === 'play_audio') {
                const voiceChannel = interaction.member.voice.channel;
                if (!voiceChannel) {
                    return interaction.reply({ content: 'You need to be in a voice channel to play audio!', ephemeral: true });
                }

                // Disable all buttons
                const playButton = new ButtonBuilder()
                    .setCustomId('play_audio')
                    .setLabel('Play New')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true);

                const replayButton = new ButtonBuilder()
                    .setCustomId('replay_audio')
                    .setLabel('Replay')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true);

                const answerButton = new ButtonBuilder()
                    .setCustomId('submit_answer')
                    .setLabel('Answer')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true);

                const actionRow = new ActionRowBuilder().addComponents(playButton, replayButton, answerButton);

                // Update embed with all buttons disabled
                await interaction.message.edit({
                    components: [actionRow]
                });

                // Connect to the voice channel and play random audio
                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: interaction.guild.id,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                });

                const audioFiles = Object.keys(sounds);
                if (audioFiles.length === 0) {
                    return interaction.reply({ content: 'No audio files available to play.', ephemeral: true });
                }

                // Select a random audio file
                this.currentAudioFile = audioFiles[Math.floor(Math.random() * audioFiles.length)];
                this.correctAnswers = sounds[this.currentAudioFile] || []; // Ensure correctAnswers is an array

                this.audioPlayer = createAudioPlayer();
                const resource = createAudioResource(path.join(audioDirectory, this.currentAudioFile));

                this.audioPlayer.play(resource);
                connection.subscribe(this.audioPlayer);

                // Update embed to reflect audio is playing
                const playButtonDisabled = new ButtonBuilder()
                    .setCustomId('play_audio')
                    .setLabel('Play New')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true);

                const replayButtonEnabled = new ButtonBuilder()
                    .setCustomId('replay_audio')
                    .setLabel('Replay')
                    .setStyle(ButtonStyle.Secondary);

                const answerButtonEnabled = new ButtonBuilder()
                    .setCustomId('submit_answer')
                    .setLabel('Answer')
                    .setStyle(ButtonStyle.Success);

                const updatedActionRow = new ActionRowBuilder().addComponents(playButtonDisabled, replayButtonEnabled, answerButtonEnabled);

                const playingEmbed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('Audio Playing')
                    .setDescription('Listen to the sound and guess!')
                    .setTimestamp();

                await interaction.message.edit({ embeds: [playingEmbed], components: [updatedActionRow] });

                // Listen for audio completion
                this.audioPlayer.once(AudioPlayerStatus.Idle, async () => {
                    console.log('Audio playback finished');

                    // Provide replay/answer options
                    const replayButtonEnabled = new ButtonBuilder()
                        .setCustomId('replay_audio')
                        .setLabel('Replay')
                        .setStyle(ButtonStyle.Secondary);

                    const answerButtonEnabled = new ButtonBuilder()
                        .setCustomId('submit_answer')
                        .setLabel('Answer')
                        .setStyle(ButtonStyle.Success);

                    const playButtonDisabled = new ButtonBuilder()
                        .setCustomId('play_audio')
                        .setLabel('Play New')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true); // Keep "Play New" disabled

                    const actionRow = new ActionRowBuilder().addComponents(playButtonDisabled, replayButtonEnabled, answerButtonEnabled);

                    const afterEmbed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle('Audio Finished')
                        .setDescription('Submit your answer or replay the audio.')
                        .setTimestamp();

                    await interaction.message.edit({ embeds: [afterEmbed], components: [actionRow] });
                });

                this.audioPlayer.on('error', (error) => {
                    console.error('Error playing audio:', error);
                });
            } else if (interaction.customId === 'replay_audio') {
                if (!this.currentAudioFile) return; // Prevent replay if no audio has been played

                // Replay the same clip
                this.audioPlayer.stop();
                const resource = createAudioResource(path.join(audioDirectory, this.currentAudioFile));
                this.audioPlayer.play(resource);

                // Update embed to show sound is replaying
                const playButtonDisabled = new ButtonBuilder()
                    .setCustomId('play_audio')
                    .setLabel('Play New')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true);

                const replayButtonDisabled = new ButtonBuilder()
                    .setCustomId('replay_audio')
                    .setLabel('Replay')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true);

                const answerButtonEnabled = new ButtonBuilder()
                    .setCustomId('submit_answer')
                    .setLabel('Answer')
                    .setStyle(ButtonStyle.Success);

                const updatedActionRow = new ActionRowBuilder().addComponents(playButtonDisabled, replayButtonDisabled, answerButtonEnabled);

                const replayingEmbed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('Replaying Audio')
                    .setDescription('Listening to the sound again.')
                    .setTimestamp();

                await interaction.message.edit({ embeds: [replayingEmbed], components: [updatedActionRow] });

                this.audioPlayer.once(AudioPlayerStatus.Idle, async () => {
                    console.log('Replay finished');

                    // Update embed to reflect final button states
                    const playButtonDisabled = new ButtonBuilder()
                        .setCustomId('play_audio')
                        .setLabel('Play New')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true);

                    const replayButtonDisabled = new ButtonBuilder()
                        .setCustomId('replay_audio')
                        .setLabel('Replay')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true);

                    const answerButtonEnabled = new ButtonBuilder()
                        .setCustomId('submit_answer')
                        .setLabel('Answer')
                        .setStyle(ButtonStyle.Success);

                    const finalActionRow = new ActionRowBuilder().addComponents(playButtonDisabled, replayButtonDisabled, answerButtonEnabled);

                    const replayedEmbed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle('Replay Finished')
                        .setDescription('You can now submit your answer.')
                        .setTimestamp();

                    await interaction.message.edit({ embeds: [replayedEmbed], components: [finalActionRow] });
                });
            } else if (interaction.customId === 'submit_answer') {
                // Handle opening the answer modal
                const answerModal = new ModalBuilder()
                    .setCustomId('submit_answer_modal')
                    .setTitle('Submit Your Guess');

                                const answerInput = new TextInputBuilder()
                    .setCustomId('answer_input')
                    .setLabel('What sound did you hear?')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const actionRow = new ActionRowBuilder().addComponents(answerInput);
                answerModal.addComponents(actionRow);

                await interaction.showModal(answerModal);
            }
        }
    },

    async handleModalSubmit(interaction) {
        if (interaction.customId === 'submit_answer_modal') {
            // Handle answer submission
            const userAnswer = interaction.fields.getTextInputValue('answer_input').toLowerCase();

            // Check if the answer is correct based on the current audio file
            const correctAnswers = this.correctAnswers;

            if (correctAnswers.some(answer => userAnswer.includes(answer.toLowerCase()))) {
                // If correct, edit existing message to update button states
                const playButton = new ButtonBuilder()
                    .setCustomId('play_audio')
                    .setLabel('Play New')
                    .setStyle(ButtonStyle.Primary);

                const replayButton = new ButtonBuilder()
                    .setCustomId('replay_audio')
                    .setLabel('Replay')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true); // Disable replay button after use

                const answerButton = new ButtonBuilder()
                    .setCustomId('submit_answer')
                    .setLabel('Answer')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true); // Disable answer button after use

                const actionRow = new ActionRowBuilder().addComponents(playButton, replayButton, answerButton);

                await interaction.reply({ content: 'Congratulations! You guessed it right!', ephemeral: true });

                // Update the original message to reset button states
                await interaction.message.edit({
                    components: [actionRow]
                });

                // Stop the audio player if it's still playing
                if (this.audioPlayer) {
                    this.audioPlayer.stop();
                }
            } else {
                await interaction.reply({ content: 'Sorry, that was not the correct answer. Try again!', ephemeral: true });

                // Provide a hint
                const hint = `Hint: ${this.correctAnswers.join(', ')}`;
                await interaction.followUp({ content: hint, ephemeral: true });
            }
        }
    }
};

