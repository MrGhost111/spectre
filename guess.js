const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const path = require('path');

module.exports = {
    name: 'guess',
    description: 'Joins the voice channel and plays an audio file',

    async execute(message) {
        // Check if the user is in a voice channel
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.channel.send('You are not in any voice channel. Please join one to get started.');
        }

        // Join the user's voice channel
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator,
        });

        // Create an embed with a play button
        const embed = new EmbedBuilder()
            .setTitle('Sniped message')
            .setDescription(`Press the button below to play the audio, ${message.author.username}.`)
            .setFooter({ text: `UserID: ${message.author.id}` });

        const playButton = new ButtonBuilder()
            .setCustomId('play')
            .setLabel('Play')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(playButton);

        // Send the embed with the button
        const sentMessage = await message.channel.send({ embeds: [embed], components: [row] });

        // Create an audio player
        const player = createAudioPlayer();
        const audioPath = path.join(__dirname, '../audio/humpback_whale.mp3');
        const resource = createAudioResource(audioPath);

        // Listen for button interactions
        const filter = (interaction) => interaction.customId === 'play' && interaction.user.id === message.author.id;
        const collector = sentMessage.createMessageComponentCollector({ filter, time: 60000 }); // 1 minute collector

        // Event: Button click
        collector.on('collect', async (interaction) => {
            if (interaction.customId === 'play') {
                // Play the audio file
                player.play(resource);
                connection.subscribe(player);

                // Update the button to disabled after click
                await interaction.update({
                    components: [new ActionRowBuilder().addComponents(playButton.setDisabled(true))],
                });

                // Audio player events
                player.on(AudioPlayerStatus.Playing, () => {
                    console.log('The audio is now playing!');
                });

                player.on(AudioPlayerStatus.Idle, () => {
                    console.log('The audio has finished playing!');
                    message.channel.send('Clip played successfully.');
                    connection.destroy();
                });

                player.on('error', error => {
                    console.error('Error playing the audio:', error);
                });
            }
        });

        // Event: Collector end
        collector.on('end', collected => {
            if (collected.size === 0) {
                // If no one pressed the button, destroy the connection
                connection.destroy();
                message.channel.send('No one pressed the play button. The bot has left the channel.');
            }
        });
    }
};
