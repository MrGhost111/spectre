const { SlashCommandBuilder, ChannelType } = require('discord.js');
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

        // IDs of the categories to process
        const categoryIds = [
            '799997847931977749',
            '842471433238347786',
            '1064095644811284490'
        ];

        try {
            console.log('Loading channels data from', dataPath);
            const channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            const missingChannels = [];
            const results = [];

            // Loop through each category
            for (const categoryId of categoryIds) {
                const category = await interaction.guild.channels.fetch(categoryId);

                if (category && category.type === ChannelType.GuildCategory) {
                    console.log(`Processing category: ${category.name} (${categoryId})`);

                    // Loop through each channel in the category
                    for (const channel of category.children.cache.values()) {
                        console.log(`Checking channel: ${channel.name} (${channel.id})`);

                        const channelInfo = channelsData[channel.id];

                        if (channelInfo) {
                            // If channel is in channels.json, update the topic
                            console.log(`Found channel in database: ${channel.id}, updating topic.`);
                            if (channel.isTextBased()) {
                                await channel.setTopic(`Owner: <@${channelInfo.userId}>`);
                                results.push(`Updated description for channel: <#${channel.id}>`);
                            } else {
                                results.push(`Channel is not a text channel: ${channel.id}`);
                            }
                        } else {
                            // If channel is not in channels.json, add it to the missing list
                            missingChannels.push(channel.id);
                            console.log(`Channel not found in database: ${channel.id}`);
                        }
                    }
                } else {
                    console.log(`Category not found or not a category: ${categoryId}`);
                }
            }

            console.log('Results:', results);
            console.log('Missing channels:', missingChannels);

            // Reply with the results of the operation
            await interaction.editReply({
                content: results.length > 0 ? results.join('\n') : 'No channels were updated.'
            });

            // Send a follow-up message for missing channels
            if (missingChannels.length > 0) {
                await interaction.channel.send({
                    content: `Channels not found in the database:\n${missingChannels.map(id => `<#${id}>`).join('\n')}`
                });
            }
        } catch (error) {
            console.error('Error executing updatechanneldesc command:', error);
            await interaction.editReply({
                content: 'An error occurred while processing the command. Please try again later.'
            });
        }
    }
};
