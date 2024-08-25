const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../data/channels.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deadchannels')
        .setDescription('Admin command to list channels whose owners are no longer in the server.'),
    async execute(interaction) {
        console.log('Executing deadchannels command');

        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            console.log('User does not have admin permissions');
            return interaction.reply({
                content: 'This command is only available to admins.',
                ephemeral: true
            });
        }

        // Acknowledge the interaction to prevent timeouts
        await interaction.deferReply();

        try {
            console.log('Loading channels data from', dataPath);
            const channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

            console.log('Channels data loaded:', channelsData);

            const deadChannels = [];

            for (const [userId, channelInfo] of Object.entries(channelsData)) {
                if (userId === 'channels') continue; // Skip the 'channels' key

                console.log(`Checking channel ${channelInfo.channelId} with owner ${channelInfo.userId}`);

                if (!channelInfo.channelId || !channelInfo.userId) {
                    console.error(`Missing channelId or userId in data:`, channelInfo);
                    continue;
                }

                try {
                    const member = await interaction.guild.members.fetch(channelInfo.userId);
                    if (!member) {
                        console.log(`Owner ${channelInfo.userId} not found for channel ${channelInfo.channelId}`);
                        deadChannels.push(`<#${channelInfo.channelId}>`);
                    }
                } catch (error) {
                    console.log(`Error fetching member ${channelInfo.userId}:`, error);
                    deadChannels.push(`<#${channelInfo.channelId}>`);
                }
            }

            console.log('Dead channels found:', deadChannels);

            if (deadChannels.length === 0) {
                console.log('No dead channels found');
                await interaction.editReply({
                    content: 'No channels found whose owners have left the server.'
                });
            } else {
                console.log('Sending embed with dead channels');
                const embed = new EmbedBuilder()
                    .setTitle('Dead Channels')
                    .setDescription(deadChannels.join('\n'))
                    .setColor(Colors.Red);

                await interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error executing deadchannels command:', error);
            await interaction.editReply({
                content: 'An error occurred while processing the command. Please try again later.'
            });
        }
    }
};
