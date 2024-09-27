const { EmbedBuilder, Colors, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../data/channels.json');

module.exports = {
    name: 'seec',
    description: 'List all channels the user is part of and add them if not already added.',
    async execute(message) {
        const userId = message.author.id;
        const channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        const userChannels = [];
        const addedChannels = [];

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

        // Check if the user is in those channels and add if not
        for (const channelId of userChannels) {
            const channel = message.guild.channels.cache.get(channelId);
            if (channel && !channel.members.has(userId)) {
                try {
                    // Use PermissionsBitField to set the VIEW_CHANNEL permission
                    await channel.permissionOverwrites.edit(userId, { 
                        [PermissionsBitField.Flags.ViewChannel]: true 
                    });
                    addedChannels.push(channel);
                } catch (error) {
                    console.error(`Failed to add ${message.author.tag} to channel ${channel.name}:`, error);
                }
            }
        }

        // Create embed to display the channels
        const embed = new EmbedBuilder()
            .setTitle('Your Channels')
            .setDescription(`You have been added to the following channels:\n\n${userChannels.map(id => `<#${id}>`).join('\n')}`)
            .setColor(Colors.Green);

        await message.reply({ embeds: [embed] });

        // Inform the user about added channels
        if (addedChannels.length > 0) {
            const addedChannelNames = addedChannels.map(channel => channel.name).join(', ');
            await message.channel.send(`You weren't in the following channels, but you've been added: ${addedChannelNames}`);
        }
    }
};
