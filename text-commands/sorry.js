const { ButtonStyle, ActionRowBuilder, ButtonBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'sorry',
    async execute(message, args) {
        // Check if user has permission
        if (!message.member.permissions.has('ADMINISTRATOR')) {
            return message.reply('You do not have permission to use this command.');
        }

        // Create the initial embed
        const trackingEmbed = new EmbedBuilder()
            .setTitle('Weekly Activity Tracking')
            .setColor(0x6666FF)
            .setDescription('No activities recorded this week.')
            .setFooter({ text: 'Last updated' })
            .setTimestamp();

        // Create the buttons
        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('add_one')
                    .setLabel('Add One')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('add_manual')
                    .setLabel('Add Manual')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('remove_manual')
                    .setLabel('Remove')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('view_logs')
                    .setLabel('View Logs')
                    .setStyle(ButtonStyle.Secondary),
            );

        const buttons2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('view_overall')
                    .setLabel('Overall Top 10')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('reset_weekly')
                    .setLabel('Reset Weekly')
                    .setStyle(ButtonStyle.Danger),
            );

        // Send and pin the embed
        const sentMessage = await message.channel.send({
            embeds: [trackingEmbed],
            components: [buttons, buttons2]
        });
        await sentMessage.pin();

        // Initialize donoLogs.json if it doesn't exist
        const donoLogsPath = path.join(__dirname, '../data/donoLogs.json');
        if (!fs.existsSync(donoLogsPath)) {
            fs.writeFileSync(donoLogsPath, JSON.stringify({}, null, 2));
        }

        // Initialize activityLogs.json if it doesn't exist
        const activityLogsPath = path.join(__dirname, '../data/activityLogs.json');
        if (!fs.existsSync(activityLogsPath)) {
            fs.writeFileSync(activityLogsPath, JSON.stringify({ logs: [], weekly: {} }, null, 2));
        }
    },
};
