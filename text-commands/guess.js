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

    async execute(message) {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply({ content: 'You need to be in a voice channel to play audio!' });
        }

        const playButton = new ButtonBuilder()
            .setCustomId('play_audio')
            .setLabel('Play Sound')
            .setStyle(ButtonStyle.Primary);

        const playButtonActionRow = new ActionRowBuilder().addComponents(playButton);

        const initialEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Guess the Sound')
            .setDescription('Click the button below to play a random sound.')
            .setTimestamp();

        await message.reply({ embeds: [initialEmbed], components: [playButtonActionRow] });
    },

    async handleInteraction(interaction) {
        if (interaction.isButton()) {
            if (interaction.customId === 'play_audio') {
                const voiceChannel = interaction.member.voice.channel;
                if (!voiceChannel) {
                    return interaction.reply({ content: 'You need to be in a voice channel to play audio!', ephemeral: true });
                }

                // Connect to the voice channel
                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: interaction.guild.id,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                });

                const audioFiles = Object.keys(sounds);
                if (audioFiles.length === 0) {
                    return interaction.reply({ content: 'No audio files available to play.', ephemeral: true });
                }

                // Select a random audio file that hasn't been played yet
                this.currentAudioFile = audioFiles[Math.floor(Math.random() * audioFiles.length)];
                const audioPlayer = createAudioPlayer();
                const resource = createAudioResource(path.join(audioDirectory, this.currentAudioFile));

                audioPlayer.play(resource);
                connection.subscribe(audioPlayer);

                await interaction.reply({ content: 'Playing a random sound. Listen and guess!', ephemeral: true });

                // Listen for audio completion
                audioPlayer.once(AudioPlayerStatus.Idle, async () => {
                    console.log('Audio playback finished');

                    // Provide replay/answer options
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

                    await interaction.message.edit({ embeds: [afterEmbed], components: [actionRow] });
                });

                audioPlayer.on('error', (error) => {
                    console.error('Error playing audio:', error);
                });
            } else if (interaction.customId === 'replay_audio') {
                // Replay the current audio clip
                if (!this.currentAudioFile) return; // Prevent replay if no audio has been played

                const audioPlayer = createAudioPlayer();
                const resource = createAudioResource(path.join(audioDirectory, this.currentAudioFile));

                audioPlayer.play(resource);
                const connection = joinVoiceChannel({
                    channelId: interaction.member.voice.channel.id,
                    guildId: interaction.guild.id,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                });

                connection.subscribe(audioPlayer);

                await interaction.reply({ content: 'Replaying the sound. Listen and guess!', ephemeral: true });

                audioPlayer.once(AudioPlayerStatus.Idle, async () => {
                    console.log('Audio playback finished on replay');

                    // Provide replay/answer options again
                    const replayButton = new ButtonBuilder()
                        .setCustomId('replay_audio')
                        .setLabel('Replay')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true); // Disable replay button after use

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

                    await interaction.message.edit({ embeds: [afterEmbed], components: [actionRow] });
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
            const correctAnswers = sounds[this.currentAudioFile];

            if (correctAnswers.includes(userAnswer)) {
                // If correct, provide a Next button
                const nextButton = new ButtonBuilder()
                    .setCustomId('next_audio')
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary);

                const actionRow = new ActionRowBuilder().addComponents(nextButton);

                await interaction.reply({ content: 'Congratulations! You guessed it right!', components: [actionRow], ephemeral: true });
            } else {
                await interaction.reply({ content: 'Sorry, that was not the correct answer. Try again!', ephemeral: true });
            }
        } else if (interaction.customId === 'next_audio') {
            // Handle moving to the next audio clip
            this.currentAudioFile = null; // Reset current audio file to allow for a new random selection

            // Trigger the audio play again as if the command was called
            await this.execute(interaction); // Pass interaction as if it's a message
        }
    }
};
