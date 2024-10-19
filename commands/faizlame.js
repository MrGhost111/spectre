const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, Colors } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../data/channels.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('faizlame')
        .setDescription('Checks channels in specified categories and updates their topics.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        // Defer the reply to give time for processing
        await interaction.deferReply();
        const channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

        // Category IDs to check
        const categoryIds = [
            '799997847931977749',
            '842471433238347786',
            '1064095644811284490',
        ];

        let processedChannels = []; // Array to keep track of processed channels
        let missingChannels = [];   // Array to track channels not found in channels.json

        // Get channels for each category and process them
        for (const categoryId of categoryIds) {
            const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);
            console.log(`Fetched category ID: ${categoryId}, Result: ${category ? 'Found' : 'Not Found'}`); // Logging

            // Check if the channel exists and is a category
            if (!category || category.type !== 4) { // 4 is the type for CATEGORY
                processedChannels.push(`Category with ID ${categoryId} not found or is not a category.`);
                continue; // Skip to the next category
            }

            // Fetch all channels in this category
            const channelsInCategory = await interaction.guild.channels.fetch().then(channels => {
                return channels.filter(channel => channel.parentId === category.id);
            });

            // Process each channel in the category
            for (const channel of channelsInCategory.values()) {
                const channelData = Object.values(channelsData).find(ch => ch.channelId === channel.id);

                if (channelData) {
                    // Update the channel topic to the owner's mention
                    await channel.setTopic(`<@${channelData.userId}>`).catch(console.error);
                    processedChannels.push(`Updated channel: <#${channel.id}> to topic: <@${channelData.userId}>.`);
                } else {
                    // If not found, log the channel ID
                    missingChannels.push(`Channel ID ${channel.id} not found in the database.`);
                }
            }
        }

        // Combine the results into a single message
        const results = [
            `Processed all categories and channels:`,
            ...processedChannels,
            '',
            'Channels not found in the database:',
            ...missingChannels,
        ];

        // Function to send the message in parts if it exceeds the character limit
        const sendInChunks = async (interaction, messages) => {
            let chunk = '';
            for (const message of messages) {
                if (chunk.length + message.length > 2000) {
                    await interaction.followUp({ embeds: [new EmbedBuilder().setDescription(chunk).setColor(Colors.Blue)] });
                    chunk = '';
                }
                chunk += `${message}\n`;
            }
            if (chunk.length > 0) {
                await interaction.followUp({ embeds: [new EmbedBuilder().setDescription(chunk).setColor(Colors.Blue)] });
            }
        };

        // Send the result messages in chunks
        await sendInChunks(interaction, results);
    },
};
