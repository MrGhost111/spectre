const { EmbedBuilder, Colors, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../data/channels.json');

module.exports = {
    name: 'deadc',
    description: 'Admin command to list channels whose owners are no longer in the server.',
    async execute(message, args) {
        // Check if the user has admin permissions
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('You cannot use this command.');
        }

        // Send a typing indicator while processing
        message.channel.sendTyping();

        try {
            const channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            const deadChannels = [];

            for (const [userId, channelInfo] of Object.entries(channelsData)) {
                if (userId === 'channels') continue; // Skip the 'channels' key

                if (!channelInfo.channelId || !channelInfo.userId) {
                    continue; // Skip entries with missing channelId or userId
                }

                try {
                    const member = await message.guild.members.fetch(channelInfo.userId);
                    if (!member) {
                        deadChannels.push(`<#${channelInfo.channelId}>`);
                    }
                } catch (error) {
                    // Add channel to dead channels list if fetching the member fails
                    deadChannels.push(`<#${channelInfo.channelId}>`);
                }
            }

            if (deadChannels.length === 0) {
                await message.channel.send('No channels found whose owners have left the server.');
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('Dead Channels')
                    .setDescription(deadChannels.join('\n'))
                    .setColor(Colors.Red);

                await message.channel.send({ embeds: [embed] });
            }
        } catch (error) {
            await message.channel.send('An error occurred while processing the command. Please try again later.');
        }
    }
};
