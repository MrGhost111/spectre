const { Events, PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: Events.MessageCreate,
    async execute(client, message) {
        // Ignore bot messages and non-command messages
        if (message.author.bot || !message.content.startsWith('!')) return;

        const args = message.content.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // Embed inspection command
        if (command === 'embed') {
            // Check permissions (you + admins)
            if (message.author.id !== '753491023208120321' &&
                !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return message.reply('nice try');
            }

            // Get the message ID (supports reply or argument)
            let targetMessageId;
            if (message.reference) {
                // If replying to a message
                targetMessageId = message.reference.messageId;
            } else if (args[0]) {
                // If providing message ID as argument
                targetMessageId = args[0];
            } else {
                return message.reply('❌ Please reply to a message or provide a message ID!');
            }

            try {
                const targetMessage = await message.channel.messages.fetch(targetMessageId);

                if (!targetMessage.embeds?.length) {
                    return message.reply('❌ This message has no embeds!');
                }

                // Format the embed data
                const embedInfo = targetMessage.embeds.map((embed, index) => {
                    return `**Embed ${index + 1}:**
**Title:** ${embed.title || 'None'}
**Description:** ${embed.description || 'None'}
**Fields:** ${embed.fields?.length || 0}
**Footer:** ${embed.footer?.text || 'None'}
**Color:** ${embed.color ? `#${embed.color.toString(16).padStart(6, '0')}` : 'Default'}
**Timestamp:** ${embed.timestamp || 'None'}`;
                }).join('\n\n');

                // Send the information
                await message.reply(`**Embed Information**\n${embedInfo}`);

                // Also log full data to console
                console.log('Full embed data:', targetMessage.embeds);

            } catch (error) {
                console.error('Error inspecting embed:', error);
                message.reply(`❌ Error: ${error.message}`);
            }
        }
    }
};