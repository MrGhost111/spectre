const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'embeddebug',
    aliases: ['edbg'],
    description: 'Debug: Extract raw message data to find hidden embed info.',
    async execute(message, args, client) {
        try {
            const targetMessage = message.reference
                ? await message.channel.messages.fetch(message.reference.messageId).catch(() => null)
                : null;

            const messageId = !targetMessage && args.length > 0 ? args[0] : null;
            const messageWithId = messageId
                ? await message.channel.messages.fetch(messageId).catch(() => null)
                : null;

            const embedMessage = targetMessage || messageWithId;

            if (!embedMessage) {
                return message.reply({
                    content: '<:xmark:934659388386451516> Please reply to a message or provide a valid message ID.'
                });
            }

            // Extract ALL possible data
            const rawData = {
                content: embedMessage.content || "No standard content",
                embeds: embedMessage.embeds.length > 0 ? embedMessage.embeds : "No traditional embeds",
                components: embedMessage.components.length > 0 ? embedMessage.components : "No components",
                attachments: embedMessage.attachments.size > 0 ? [...embedMessage.attachments.values()] : "No attachments",
                stickers: embedMessage.stickers.size > 0 ? [...embedMessage.stickers.values()] : "No stickers",
                reactions: embedMessage.reactions.cache.size > 0 ? [...embedMessage.reactions.cache.values()] : "No reactions",
                flags: embedMessage.flags.bitfield,
                type: embedMessage.type,
                interaction: embedMessage.interaction || "No interaction",
            };

            // Convert to readable JSON format
            const jsonData = JSON.stringify(rawData, null, 2);
            const truncatedJson = jsonData.length > 1000 ? jsonData.substring(0, 997) + "..." : jsonData;

            // Build response embed
            const responseEmbed = new EmbedBuilder()
                .setTitle('<:lbtest:1064919048242090054> Debug: Extracted Raw Message Data')
                .setColor('#ff4500')
                .setDescription("Here’s everything extracted from the message.")
                .setTimestamp()
                .addFields({ name: 'Raw Data (JSON)', value: `\`\`\`json\n${truncatedJson}\n\`\`\`` });

            return message.reply({ embeds: [responseEmbed] });

        } catch (error) {
            console.error('Error in embed debug extraction:', error);
            return message.reply({
                content: `<:xmark:934659388386451516> An error occurred while extracting message data: ${error.message}`
            });
        }
    },
};