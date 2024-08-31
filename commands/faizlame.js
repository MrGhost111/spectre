const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../data/channels.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('faizlame')
        .setDescription('Admin command to set channel descriptions to their respective owners.'),
    async execute(interaction) {
        console.log('Executing updatechanneldesc command');

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

            const results = [];

            for (const [userId, channelInfo] of Object.entries(channelsData)) {
                if (userId === 'channels') continue; // Skip the 'channels' key

                console.log(`Processing channel ${channelInfo.channelId} for owner ${channelInfo.userId}`);

                if (!channelInfo.channelId || !channelInfo.userId) {
                    console.error(`Missing channelId or userId in data:`, channelInfo);
                    results.push(`Skipped channel due to missing data.`);
                    continue;
                }

                try {
                    const channel = await interaction.guild.channels.fetch(channelInfo.channelId);
                    if (channel && channel.isTextBased()) {
                        await channel.setTopic(`Owner: <@${channelInfo.userId}>`);
                        results.push(`Updated description for channel: <#${channel.id}>`);
                        console.log(`Updated description for channel ${channel.id}`);
                    } else {
                        results.push(`Channel not found or not a text channel: ${channelInfo.channelId}`);
                        console.log(`Channel not found or not a text channel: ${channelInfo.channelId}`);
                    }
                } catch (error) {
                    console.log(`Error fetching or updating channel ${channelInfo.channelId}:`, error);
                    results.push(`Error updating channel: <#${channelInfo.channelId}>`);
                }
            }

            console.log('Results:', results);

            await interaction.editReply({
                content: results.join('\n'),
            });
        } catch (error) {
            console.error('Error executing updatechanneldesc command:', error);
            await interaction.editReply({
                content: 'An error occurred while processing the command. Please try again later.'
            });
        }
    }
};
