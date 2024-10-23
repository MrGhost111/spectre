const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const { MessageActionRow, MessageButton, MessageEmbed } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'testv',
    async execute(message, args) {
        // Check if the user is in a voice channel
        const { channel } = message.member.voice;

        if (!channel) {
            return message.reply('You need to join a voice channel first!');
        }

        // Join the voice channel
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator,
        });

        connection.on(VoiceConnectionStatus.Ready, () => {
            console.log('Connected to the voice channel!');
            sendInitialEmbed(message);
        });

        connection.on(VoiceConnectionStatus.Disconnected, () => {
            connection.destroy();
        });
    },
};

async function sendInitialEmbed(message) {
    const embed = new MessageEmbed()
        .setTitle('Voice Channel Actions')
        .setDescription('Choose an action to perform in the voice channel:')
        .setColor(0x0099ff);

    const playNewButton = new MessageButton()
        .setCustomId('play_new')
        .setLabel('Play New')
        .setStyle('PRIMARY');

    const replayButton = new MessageButton()
        .setCustomId('replay')
        .setLabel('Replay')
        .setStyle('SECONDARY');

    const row = new MessageActionRow().addComponents(playNewButton, replayButton);

    const sentMessage = await message.channel.send({ embeds: [embed], components: [row] });

    const filter = i => ['play_new', 'replay'].includes(i.customId) && i.user.id === message.author.id;
    const collector = sentMessage.createMessageComponentCollector({ filter, time: 60000 });

    let lastPlayedFile = '';

    collector.on('collect', async i => {
        if (i.customId === 'play_new') {
            lastPlayedFile = await playRandomAudio(message);
        } else if (i.customId === 'replay') {
            await replayAudio(message, lastPlayedFile);
        }
        await i.deferUpdate();
    });

    collector.on('end', collected => {
        sentMessage.edit({ components: [] });
    });
}

async function playRandomAudio(message) {
    const { channel } = message.member.voice;
    const audioFiles = fs.readdirSync(path.join(__dirname, '../audio')).filter(file => file.endsWith('.mp3'));
    const randomFile = audioFiles[Math.floor(Math.random() * audioFiles.length)];
    const resource = createAudioResource(path.join(__dirname, '../audio', randomFile));
    const player = createAudioPlayer();

    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
    });

    connection.subscribe(player);
    player.play(resource);

    player.on(AudioPlayerStatus.Playing, () => {
        console.log(`Playing: ${randomFile}`);
        message.channel.send(`Now playing: ${randomFile}`);
    });

    player.on(AudioPlayerStatus.Idle, () => {
        player.stop();
    });

    return randomFile;
}

async function replayAudio(message, file) {
    const { channel } = message.member.voice;
    const resource = createAudioResource(path.join(__dirname, '../audio', file));
    const player = createAudioPlayer();

    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
    });

    connection.subscribe(player);
    player.play(resource);

    player.on(AudioPlayerStatus.Playing, () => {
        console.log(`Replaying: ${file}`);
        message.channel.send(`Replaying: ${file}`);
    });

    player.on(AudioPlayerStatus.Idle, () => {
        player.stop();
    });
}
