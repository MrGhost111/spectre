const { EmbedBuilder, Colors } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../data/channels.json');

module.exports = {
    name: 'seec',
    description: 'Admin command to list all channels an admin user is part of',
    async execute(message) {
        // Check for admin permissions
        if (!message.member.permissions.has('ADMINISTRATOR')) {
            return message.reply('This command is only available to admins.');
        }

        const userId = message.author.id;
        const channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        const userChannels = [];

        // Loop through all channels in channels.json
        for (const [_, channelInfo] of Object.entries(channelsData)) {
            // Ensure channelInfo and channelInfo.friends are defined
            if (channelInfo && channelInfo.friends && channelInfo.friends.includes(userId)) {
                userChannels.push(channelInfo.channelId);
            }
        }

        if (userChannels.length === 0) {
            return message.reply('You are not listed in any channels.');
        }

        // Create embed to display the channels
        const embed = new EmbedBuilder()
            .setTitle('Your Channels')
            .setDescription(`You have been added to the following channels:\n\n${userChannels.map(id => `<#${id}>`).join('\n')}`)
            .setColor(Colors.Green);

        await message.reply({ embeds: [embed] });
    }
};
