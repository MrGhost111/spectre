const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'embed',
    description: 'Inspect the embed data of a message (Admin only)',
    async execute(message, args) {
        // Permission check (your ID + specific role)
        const allowedRoleId = '746298070685188197';
        const allowedUserId = '753491023208120321';

        if (!message.member.roles.cache.has(allowedRoleId) &&
            message.author.id !== allowedUserId) {
            return message.reply('❌ This command is for admins only!');
        }

        // Get target message (either replied message or provided ID)
        let targetMessage;
        if (message.reference) {
            // Get message being replied to
            try {
                targetMessage = await message.channel.messages.fetch(message.reference.messageId);
            } catch (error) {
                return message.reply('❌ Could not fetch the replied message.');
            }
        } else if (args[0]) {
            // Get message by ID
            try {
                targetMessage = await message.channel.messages.fetch(args[0]);
            } catch (error) {
                return message.reply('❌ Invalid message ID or message not in this channel.');
            }
        } else {
            return message.reply('❌ Please reply to a message or provide a message ID.');
        }

        // Check if message has embeds
        if (!targetMessage.embeds?.length) {
            return message.reply('❌ This message has no embeds to inspect.');
        }

        // Create detailed embed information
        const embedInfo = targetMessage.embeds.map((embed, index) => {
            return `**Embed ${index + 1}**:
**Title:** ${embed.title || 'None'}
**Description:** ${embed.description ? `\`\`\`${embed.description}\`\`\`` : 'None'}
**Fields:** ${embed.fields?.length ? embed.fields.map(f => `• ${f.name}: ${f.value}`).join('\n') : 'None'}
**Footer:** ${embed.footer?.text || 'None'}
**Color:** ${embed.color ? `#${embed.color.toString(16).padStart(6, '0')}` : 'Default'}
**Timestamp:** ${embed.timestamp || 'None'}`;
        }).join('\n\n');

        // Send the information (split if too long)
        try {
            if (embedInfo.length <= 2000) {
                await message.reply(`**Embed Inspection**\n${embedInfo}`);
            } else {
                // Send first part in channel
                await message.reply(`**Embed Inspection (Part 1)**\n${embedInfo.substring(0, 2000)}`);

                // Send remainder via DM
                await message.author.send(`**Embed Inspection (Part 2)**\n${embedInfo.substring(2000)}`)
          
                    .catch(() => message.reply('Could not send full details via DM.'));
            }

            // Also log to console for debugging
            console.log('Inspected embeds:', targetMessage.embeds);
        } catch (error) {
            console.error('Error sending embed info:', error);
            return message.reply('❌ Failed to send embed information.');
        }
    }
};