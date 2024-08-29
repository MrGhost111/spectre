const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
    name: 'guess',
    description: 'Play a clip and guess the answer',
    async execute(message, args) {
        const { client } = message;

        // Specify the ID of the voice channel that users need to be in
        const requiredChannelId = 'YOUR_VOICE_CHANNEL_ID_HERE';

        // Check if the user is in the specified voice channel
        const member = message.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return message.reply('You need to be in a voice channel to use this command.');
        }

        if (voiceChannel.id !== requiredChannelId) {
            return message.reply('You must be in the specified voice channel to use this command.');
        }

        // Join the voice channel
        const connection = await voiceChannel.join();

        // Create an embed with buttons
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Guess the Clip')
            .setDescription('The clip is playing. What do you want to do?')
            .setFooter({ text: 'Guess Game', iconURL: client.user.avatarURL() });

        // Create buttons
        const replayButton = new ButtonBuilder()
            .setCustomId('replay_clip')
            .setLabel('Replay Clip')
            .setStyle(ButtonStyle.Primary);

        const answerButton = new ButtonBuilder()
            .setCustomId('answer_clip')
            .setLabel('Answer')
            .setStyle(ButtonStyle.Secondary);

        // Create action row
        const actionRow = new ActionRowBuilder()
            .addComponents(replayButton, answerButton);

        // Send embed and buttons
        await message.reply({ embeds: [embed], components: [actionRow] });

        // Logic to play the clip (this is a placeholder, replace with actual clip playback logic)
        const dispatcher = connection.play('path/to/your/clip.mp3'); // Adjust path to your clip

        dispatcher.on('finish', () => {
            console.log('Clip finished playing.');
        });

        dispatcher.on('error', (error) => {
            console.error('Error playing the clip:', error);
        });
    },
};
