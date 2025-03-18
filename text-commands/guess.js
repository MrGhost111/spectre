const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');
const audioFolderPath = path.join(__dirname, '../../audio');

// Create a path for the JSON file to store answers and synonyms
const dataPath = path.join(__dirname, '../data/sound-answers.json');
const leaderboardPath = path.join(__dirname, '../data/sound-leaderboard.json');

// Initialize the answers data structure if it doesn't exist
function initializeAnswersData() {
    if (!fs.existsSync(dataPath)) {
        const answersData = {
            "bubbles.mp3": ["bubbles", "bubble"],
            "cat.mp3": ["cat", "meow", "kitten"],
            "clock_tick_tock.mp3": ["clock", "watch", "tick tock", "ticking"],
            "dolphin.mp3": ["dolphin", "porpoise"],
            "elephant.mp3": ["elephant"],
            "footsteps_sound.mp3": ["footsteps", "steps", "walking", "footstep"],
            "glass_breaking.mp3": ["glass", "breaking glass", "shatter", "broken glass"],
            "helicopter.mp3": ["helicopter", "chopper", "heli"],
            "humpback_whale.mp3": ["whale", "humpback whale", "humpback"],
            "knock_knock_door.mp3": ["knock", "door", "knocking", "knock knock"],
            "laser_sound.mp3": ["laser", "beam", "ray gun"],
            "raining.mp3": ["rain", "raining", "raindrops", "shower"],
            "sparrow.mp3": ["sparrow", "bird", "chirping"],
            "thunder.mp3": ["thunder", "lightning", "storm"],
            "waves.mp3": ["waves", "ocean", "sea", "surf"],
            "wind.mp3": ["wind", "breeze", "gust"]
        };
        fs.writeFileSync(dataPath, JSON.stringify(answersData, null, 2));
    }
}

// Initialize the leaderboard data structure if it doesn't exist
function initializeLeaderboardData() {
    if (!fs.existsSync(leaderboardPath)) {
        const leaderboardData = {};
        fs.writeFileSync(leaderboardPath, JSON.stringify(leaderboardData, null, 2));
    }
}

// Function to get a list of all audio files
function getAudioFiles() {
    try {
        return fs.readdirSync(audioFolderPath).filter(file => file.endsWith('.mp3'));
    } catch (error) {
        console.error('Error reading audio directory:', error);
        return [];
    }
}

// Function to get a random audio file
function getRandomAudioFile(previousFile = null) {
    const audioFiles = getAudioFiles();
    if (audioFiles.length === 0) return null;

    // If there's only one file or no previous file, just return a random one
    if (audioFiles.length === 1 || !previousFile) {
        return audioFiles[Math.floor(Math.random() * audioFiles.length)];
    }

    // Filter out the previous file to avoid repetition
    const availableFiles = audioFiles.filter(file => file !== previousFile);
    return availableFiles[Math.floor(Math.random() * availableFiles.length)];
}

// Function to update the player buttons based on state
function updatePlayerButtons(isPlaying, playerState) {
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('play_new')
            .setLabel('Play New')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(isPlaying),
        new ButtonBuilder()
            .setCustomId('replay')
            .setLabel('Replay')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!isPlaying),
        new ButtonBuilder()
            .setCustomId('answer')
            .setLabel('Answer')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!isPlaying),
        new ButtonBuilder()
            .setCustomId('leaderboard')
            .setLabel('Leaderboard')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(false)
    );

    return buttons;
}

// Function to check if the answer is correct
function isAnswerCorrect(userAnswer, soundFile) {
    try {
        const answersData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        const acceptableAnswers = answersData[soundFile] || [];
        return acceptableAnswers.some(answer =>
            userAnswer.toLowerCase().trim() === answer.toLowerCase().trim());
    } catch (error) {
        console.error('Error checking answer:', error);
        return false;
    }
}

// Function to update the leaderboard
function updateLeaderboard(userId, username, correct) {
    try {
        const leaderboardData = JSON.parse(fs.readFileSync(leaderboardPath, 'utf8'));

        if (!leaderboardData[userId]) {
            leaderboardData[userId] = {
                username,
                correct: 0,
                attempts: 0
            };
        }

        // Update the user's entry
        leaderboardData[userId].username = username; // Keep username updated
        leaderboardData[userId].attempts++;

        if (correct) {
            leaderboardData[userId].correct++;
        }

        fs.writeFileSync(leaderboardPath, JSON.stringify(leaderboardData, null, 2));
    } catch (error) {
        console.error('Error updating leaderboard:', error);
    }
}

// Function to get the leaderboard data
function getLeaderboardData() {
    try {
        const leaderboardData = JSON.parse(fs.readFileSync(leaderboardPath, 'utf8'));
        return Object.values(leaderboardData)
            .sort((a, b) => b.correct - a.correct)
            .slice(0, 10); // Top 10
    } catch (error) {
        console.error('Error getting leaderboard data:', error);
        return [];
    }
}

module.exports = {
    name: 'guess',
    async execute(message) {
        // Initialize the data files if they don't exist
        initializeAnswersData();
        initializeLeaderboardData();

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply('You need to be in a voice channel to use this command!');
        }

        // Check if the voice channel is in the same guild (server)
        if (voiceChannel.guild.id !== message.guild.id) {
            return message.reply('You must be in a voice channel in this server!');
        }

        try {
            // Join the voice channel
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            });

            // Create audio player
            const player = createAudioPlayer();
            connection.subscribe(player);

            // Create the embed
            const embed = new EmbedBuilder()
                .setTitle('🎵 Sound Guessing Game 🎵')
                .setDescription('Press "Play New" to start the game!\n\nListen to the sound and try to guess what it is.')
                .setColor('#3498db');

            // Create the buttons
            const buttons = updatePlayerButtons(false);

            // Send the message with the embed and buttons
            const playerMessage = await message.channel.send({
                embeds: [embed],
                components: [buttons]
            });

            // Create player state
            const playerState = {
                connection,
                player,
                currentClip: null,
                isPlaying: false,
                embed,
                messageId: playerMessage.id
            };

            // Store the player state globally
            global.playerStates = global.playerStates || {};
            global.playerStates[playerMessage.id] = playerState;

            // Set up button collector
            const collector = playerMessage.createMessageComponentCollector({
                time: 3600000 // 1 hour timeout
            });

            // Handle button interactions
            collector.on('collect', async i => {
                // Check if the user is in the same voice channel
                if (!i.member.voice.channel || i.member.voice.channelId !== voiceChannel.id) {
                    await i.reply({ content: 'You need to be in the same voice channel to use this!', ephemeral: true });
                    return;
                }

                const currentState = global.playerStates[playerMessage.id];

                if (i.customId === 'play_new') {
                    // Select a random audio file (different from the current one)
                    const audioFile = getRandomAudioFile(currentState.currentClip);
                    currentState.currentClip = audioFile;
                    currentState.isPlaying = true;

                    // Create an audio resource from the file
                    const resource = createAudioResource(path.join(audioFolderPath, audioFile));
                    player.play(resource);

                    // Update the embed
                    const updatedEmbed = EmbedBuilder.from(currentState.embed)
                        .setDescription('🔊 Sound is playing! Listen carefully and try to guess.\n\nPress "Replay" to hear it again or "Answer" to submit your guess.');

                    // Update the buttons
                    const updatedButtons = updatePlayerButtons(true, currentState);

                    await i.update({
                        embeds: [updatedEmbed],
                        components: [updatedButtons]
                    });
                }
                else if (i.customId === 'replay') {
                    // Replay the current audio
                    if (currentState.currentClip) {
                        const resource = createAudioResource(path.join(audioFolderPath, currentState.currentClip));
                        player.play(resource);
                        await i.reply({ content: 'Playing the sound again...', ephemeral: true });
                    } else {
                        await i.reply({ content: 'No sound has been played yet!', ephemeral: true });
                    }
                }
                else if (i.customId === 'answer') {
                    // Create a modal for the user to submit their answer
                    const modal = new ModalBuilder()
                        .setCustomId(`answer_modal_${playerMessage.id}`)
                        .setTitle('What sound is this?');

                    const answerInput = new TextInputBuilder()
                        .setCustomId('answer_input')
                        .setLabel('Your answer:')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder('Type your answer here...');

                    const firstActionRow = new ActionRowBuilder().addComponents(answerInput);
                    modal.addComponents(firstActionRow);

                    await i.showModal(modal);
                }
                else if (i.customId === 'leaderboard') {
                    // Show the leaderboard
                    const leaderboardData = getLeaderboardData();

                    let leaderboardText = "**Sound Guessing Game Leaderboard**\n\n";

                    if (leaderboardData.length === 0) {
                        leaderboardText += "No scores recorded yet!";
                    } else {
                        leaderboardData.forEach((user, index) => {
                            leaderboardText += `${index + 1}. **${user.username}**: ${user.correct} correct (${user.attempts} attempts)\n`;
                        });
                    }

                    await i.reply({ content: leaderboardText, ephemeral: true });
                }
            });

            // Handle modal submissions
            message.client.on('interactionCreate', async interaction => {
                if (!interaction.isModalSubmit()) return;

                if (interaction.customId === `answer_modal_${playerMessage.id}`) {
                    const userAnswer = interaction.fields.getTextInputValue('answer_input');
                    const currentState = global.playerStates[playerMessage.id];

                    if (!currentState || !currentState.currentClip) {
                        await interaction.reply({ content: 'No sound is currently playing!', ephemeral: true });
                        return;
                    }

                    const correct = isAnswerCorrect(userAnswer, currentState.currentClip);

                    // Update the leaderboard
                    updateLeaderboard(
                        interaction.user.id,
                        interaction.user.username,
                        correct
                    );

                    // Prepare the response
                    let responseText = '';
                    if (correct) {
                        responseText = `✅ Correct! The sound was "${currentState.currentClip.replace('.mp3', '')}"!`;
                    } else {
                        responseText = `❌ Sorry, that's not correct. The sound was "${currentState.currentClip.replace('.mp3', '')}"!`;
                    }

                    // Update the embed for everyone
                    const updatedEmbed = EmbedBuilder.from(currentState.embed)
                        .setDescription(`${interaction.user.username} guessed: "${userAnswer}"\n\n${responseText}\n\nPress "Play New" to hear a different sound!`);

                    // Update the buttons
                    currentState.isPlaying = false;
                    const updatedButtons = updatePlayerButtons(false, currentState);

                    await playerMessage.edit({
                        embeds: [updatedEmbed],
                        components: [updatedButtons]
                    });

                    await interaction.reply({
                        content: responseText,
                        ephemeral: true
                    });
                }
            });

            // Handle player state changes
            player.on(AudioPlayerStatus.Idle, () => {
                // The audio has finished playing
                console.log('Audio playback finished');
            });

            // Handle collector end
            collector.on('end', async () => {
                // Clean up resources
                if (global.playerStates[playerMessage.id]) {
                    connection.destroy();
                    delete global.playerStates[playerMessage.id];

                    try {
                        // Try to update the message to show it's expired
                        await playerMessage.edit({
                            content: 'Sound guessing game session has expired. Type the command again to start a new game!',
                            embeds: [],
                            components: []
                        });
                    } catch (error) {
                        console.error('Error updating expired message:', error);
                    }
                }
            });

        } catch (error) {
            console.error('Error executing command guess:', error);
            message.reply('An error occurred while trying to start the sound guessing game.');
        }
    }
};