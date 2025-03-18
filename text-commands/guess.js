const { createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const path = require('path');
const fs = require('fs');
const { EmbedBuilder } = require('discord.js');

// Function to get a random file from the audio directory
function getRandomAudioFile(directory) {
    const files = fs.readdirSync(directory).filter(file =>
        file.endsWith('.mp3') || file.endsWith('.wav') || file.endsWith('.ogg')
    );

    if (files.length === 0) {
        throw new Error('No audio files found in the specified directory');
    }

    const randomFile = files[Math.floor(Math.random() * files.length)];
    return {
        path: path.join(directory, randomFile),
        name: randomFile.split('.')[0] // Get name without extension
    };
}

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        if (!interaction.isButton()) return;

        const { customId } = interaction;
        const messageId = interaction.message.id;
        const audioFolderPath = path.join(__dirname, '../../audio');

        // Check if this button is for our game
        if (!global.playerStates || !global.playerStates[messageId]) return;

        const gameState = global.playerStates[messageId];

        switch (customId) {
            case 'play_new':
                try {
                    await interaction.deferUpdate();

                    // Get a random audio file
                    const { path: audioPath, name: clipName } = getRandomAudioFile(audioFolderPath);
                    const resource = createAudioResource(audioPath);

                    // Play the audio
                    gameState.player.play(resource);
                    gameState.currentClip = audioPath;
                    gameState.clipName = clipName;
                    gameState.isPlaying = true;

                    // Update buttons
                    const updatedRow = gameState.buttons.setComponents(
                        gameState.buttons.components[0].setDisabled(true),
                        gameState.buttons.components[1].setDisabled(false),
                        gameState.buttons.components[2].setDisabled(false)
                    );

                    // Update embed
                    const updatedEmbed = EmbedBuilder.from(gameState.embed)
                        .setDescription('Guess what sound this is!');

                    await gameState.playerMessage.edit({
                        embeds: [updatedEmbed],
                        components: [updatedRow]
                    });

                    // Handle when audio finishes playing
                    gameState.player.once(AudioPlayerStatus.Idle, () => {
                        gameState.isPlaying = false;
                    });

                } catch (error) {
                    console.error('Error playing audio:', error);
                    await interaction.followUp({
                        content: 'Failed to play audio file. Please try again.',
                        ephemeral: true
                    });
                }
                break;

            case 'replay':
                try {
                    await interaction.deferUpdate();

                    if (gameState.currentClip) {
                        const resource = createAudioResource(gameState.currentClip);
                        gameState.player.play(resource);
                        gameState.isPlaying = true;

                        // Handle when audio finishes playing
                        gameState.player.once(AudioPlayerStatus.Idle, () => {
                            gameState.isPlaying = false;
                        });
                    }
                } catch (error) {
                    console.error('Error replaying audio:', error);
                    await interaction.followUp({
                        content: 'Failed to replay audio. Please try again.',
                        ephemeral: true
                    });
                }
                break;

            case 'answer':
                try {
                    // Reveal the answer
                    const answerEmbed = EmbedBuilder.from(gameState.embed)
                        .setDescription(`The sound was: **${gameState.clipName}**\n\nPress "Play New" to continue!`);

                    const resetButtons = gameState.buttons.setComponents(
                        gameState.buttons.components[0].setDisabled(false),
                        gameState.buttons.components[1].setDisabled(true),
                        gameState.buttons.components[2].setDisabled(true)
                    );

                    await interaction.update({
                        embeds: [answerEmbed],
                        components: [resetButtons]
                    });
                } catch (error) {
                    console.error('Error showing answer:', error);
                    await interaction.followUp({
                        content: 'Failed to show the answer. Please try again.',
                        ephemeral: true
                    });
                }
                break;
        }
    }
};