const fs = require('fs');
const { joinVoiceChannel } = require('@discordjs/voice');
const { VoiceConnection, StreamDispatcher } = require('discord.js');

module.exports = {
  name: 'guess',
  async execute(message, args) {
    if (!message.member.voice.channel) {
      return message.reply('You need to be in a voice channel to use this command!');
    }

    const connection = await joinVoiceChannel({
      channelId: message.member.voice.channel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
    });

    const audioPath = fs.join(__dirname, 'audio', 'humpback_whale.mp3');
    const stream = fs.createReadStream(audioPath);

    const dispatcher = connection.play(stream, { volume: 0.5 }); // Adjust volume as needed (0 - 1)

    dispatcher.on('start', () => {
      message.channel.send('Playing humpback_whale.mp3');
    });

    dispatcher.on('finish', () => {
      connection.disconnect();
    });

    dispatcher.on('error', (error) => {
      console.error(error);
      connection.disconnect();
      message.channel.send('There was an error playing the audio file.');
    });
  },
};
