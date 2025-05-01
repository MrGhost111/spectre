const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'embed',
    aliases: ['ei', 'embed', 'extract'],
    description: 'Extract information from an embed or component in the referenced message',
    async execute(message, args, client) {
        try {
            // Get the target message
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
                    content: '<:xmark:934659388386451516> Please reply to a message or provide a message ID.'
                });
            }

            // Extract embed or component data
            const results = [];

            /*** Handle Traditional Embeds ***/
            if (embedMessage.embeds.length > 0) {
                for (const embed of embedMessage.embeds) {
                    results.push({
                        title: embed.title || null,
                        description: embed.description || null,
                        color: embed.color ? embed.color.toString(16) : null,
                        author: embed.author ? embed.author.name : null,
                        fields: embed.fields.map(field => ({
                            name: field.name,
                            value: field.value,
                            inline: field.inline,
                        })),
                    });
                }
            }

            /*** Handle New Discord Components (Text Displays) ***/
            if (embedMessage.components.length > 0) {
                for (const component of embedMessage.components) {
                    if (component.type === 1) { // Type 1 = Action Rows (contains buttons/selects)
                        for (const subComponent of component.components) {
                            if (subComponent.type === 4) { // Type 4 = Text Display
                                results.push({
                                    content: subComponent.label || subComponent.value || null,
                                });
                            }
                        }
                    }
                }
            }

            // If no data found, send an error
            if (results.length === 0) {
                return message.reply({
                    content: '<:xmark:934659388386451516> No extractable embed or component data found.'
                });
            }

            // Build response embed
            const responseEmbed = new EmbedBuilder()
                .setTitle('<:lbtest:1064919048242090054> Extracted Information')
                .setColor('#4c00b0')
                .setDescription(`Found ${results.length} extracted data entries.`)
                .setTimestamp();

            results.forEach((data, i) => {
                let infoText = '';

                if (data.title) infoText += `**Title:** ${data.title}\n`;
                if (data.description) infoText += `**Description:** ${data.description.substring(0, 500)}\n`;
                if (data.color) infoText += `**Color:** #${data.color}\n`;
                if (data.author) infoText += `**Author:** ${data.author}\n`;
                if (data.fields) {
                    infoText += `**Fields:** ${data.fields.length}\n`;
                }
                if (data.content) infoText += `**Component Content:** ${data.content}\n`;

                responseEmbed.addFields({ name: `Data #${i + 1}`, value: infoText || 'No data' });
            });

            return message.reply({ embeds: [responseEmbed] });

        } catch (error) {
            console.error('Error in embed extraction:', error);
            return message.reply({
                content: `<:xmark:934659388386451516> An error occurred while extracting embed data: ${error.message}`
            });
        }
    },
};