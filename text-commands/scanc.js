const { weeklyChannelCheck } = require('../utils/autoch');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'touchchannels',
    async execute(message, args) {
        // Define the admin roles that can run this command
        const adminRoles = [
            '768448955804811274', // Admin role IDs
            '783032959350734868'  // Additional admin roles
        ];

        // Allow specific users by ID
        const allowedUserIds = [
            '753491023208120321'  // Your user ID
        ];

        // Check if the user has permission to run this command
        const hasPermission =
            message.member.roles.cache.some(role => adminRoles.includes(role.id)) ||
            allowedUserIds.includes(message.author.id);

        if (!hasPermission) {
            return message.reply({
                content: 'You do not have permission to run this command.',
                allowedMentions: { repliedUser: false }
            });
        }

        // Send initial response
        const initialEmbed = new EmbedBuilder()
            .setTitle('Channel Eligibility Scan')
            .setDescription('Starting channel eligibility scan...')
            .setColor(0x3498db)
            .setFooter({ text: `Initiated by ${message.author.tag}` })
            .setTimestamp();

        const initialReply = await message.reply({
            embeds: [initialEmbed],
            allowedMentions: { repliedUser: false }
        });

        try {
            // Run the weekly channel check with the current channel as the log channel
            const results = await weeklyChannelCheck(message.client, message.channel.id);

            // Create a summary embed
            const summaryEmbed = new EmbedBuilder()
                .setTitle('Channel Eligibility Scan Complete')
                .setDescription(`
                    **Scan Results Summary:**
                    - Channels Checked: ${results.channelsChecked}
                    - Owners Without Required Roles: ${results.ownersWithoutRoles}
                    - Channels With Excess Friends: ${results.channelsWithExcessFriends}
                    - Total Friends Removed: ${results.friendsRemoved}
                    - Errors: ${results.errors.length}
                `)
                .setColor(0x2ecc71)
                .setFooter({ text: `Scan completed • Initiated by ${message.author.tag}` })
                .setTimestamp();

            // Update the initial reply with the summary
            await initialReply.edit({ embeds: [summaryEmbed] });

        } catch (error) {
            console.error('Error running channel scan command:', error);

            // Create an error embed
            const errorEmbed = new EmbedBuilder()
                .setTitle('Channel Scan Error')
                .setDescription(`An error occurred while running the channel scan:\n\`\`\`${error.message}\`\`\``)
                .setColor(0xe74c3c)
                .setFooter({ text: `Error occurred • Initiated by ${message.author.tag}` })
                .setTimestamp();

            // Update the initial reply with the error
            await initialReply.edit({ embeds: [errorEmbed] });
        }
    }
};
