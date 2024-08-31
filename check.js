const { createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, joinVoiceChannel } = require('@discordjs/voice');
const fs = require('fs');
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();  // Load environment variables from .env

const audioPlayer = createAudioPlayer();
const audioPath = '/home/ubuntu/spectre/audio/humpback_whale.mp3';

// Replace these with actual values
const channelId = '1278455977196126238';  // Replace with an actual channel ID
const guildId = '765778956736528385';      // Replace with an actual guild ID

if (fs.existsSync(audioPath)) {
    console.log('Audio file exists');

    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

    client.once('ready', () => {
        console.log('Bot is ready');

        // Join the voice channel
        const connection = joinVoiceChannel({
            channelId: channelId,
            guildId: guildId,
            adapterCreator: client.guilds.cache.get(guildId).voiceAdapterCreator,
        });

        connection.on(VoiceConnectionStatus.Ready, () => {
            console.log('Connection ready');
            const audioResource = createAudioResource(audioPath);

            audioPlayer.play(audioResource);
            console.log('Audio is playing');

            audioPlayer.on(AudioPlayerStatus.Idle, () => {
                console.log('Audio playback finished');
                connection.destroy(); // Disconnect from the voice channel after playback
            });

            audioPlayer.on('error', (error) => {
                console.error('Error playing audio:', error);
            });

            connection.subscribe(audioPlayer);
        });

        connection.on('error', (error) => {
            console.error('Connection error:', error);
        });
    });

    client.login(process.env.DISCORD_TOKEN); // Use the token from .env file
} else {
    console.error('Audio file does not exist');
}
