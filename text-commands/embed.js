const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'embed',
    aliases: ['ei', 'embed', 'extract'],
    description: 'Extract all information from an embed in the referenced message',
    async execute(message, args, client) {
        try {
            // Check if message is replying to another message
            const targetMessage = message.reference
                ? await message.channel.messages.fetch(message.reference.messageId).catch(() => null)
                : null;

            // If no reply, check if a message ID was provided in args
            const messageId = !targetMessage && args.length > 0 ? args[0] : null;
            const messageWithId = messageId
                ? await message.channel.messages.fetch(messageId).catch(() => null)
                : null;

            // Determine which message to use
            const embedMessage = targetMessage || messageWithId;

            // If no message found, send error
            if (!embedMessage) {
                return message.reply({
                    content: '<:xmark:934659388386451516> Please reply to a message or provide a message ID that contains an embed.'
                });
            }

            // Check if the message has embeds
            if (!embedMessage.embeds || embedMessage.embeds.length === 0) {
                return message.reply({
                    content: '<:xmark:934659388386451516> The specified message does not contain any embeds.'
                });
            }

            // Process each embed
            const results = [];

            for (let i = 0; i < embedMessage.embeds.length; i++) {
                const embed = embedMessage.embeds[i];
                const embedData = {};

                // Basic embed properties
                if (embed.title) embedData.title = embed.title;
                if (embed.description) embedData.description = embed.description;
                if (embed.url) embedData.url = embed.url;
                if (embed.color) embedData.color = embed.color.toString(16);
                if (embed.timestamp) embedData.timestamp = new Date(embed.timestamp).toISOString();

                // Author
                if (embed.author) {
                    embedData.author = {
                        name: embed.author.name || null,
                        url: embed.author.url || null,
                        iconURL: embed.author.iconURL || null
                    };
                }

                // Footer
                if (embed.footer) {
                    embedData.footer = {
                        text: embed.footer.text || null,
                        iconURL: embed.footer.iconURL || null
                    };
                }

                // Thumbnail
                if (embed.thumbnail) {
                    embedData.thumbnail = embed.thumbnail.url || null;
                }

                // Image
                if (embed.image) {
                    embedData.image = embed.image.url || null;
                }

                // Fields
                if (embed.fields && embed.fields.length > 0) {
                    embedData.fields = embed.fields.map(field => ({
                        name: field.name,
                        value: field.value,
                        inline: field.inline
                    }));
                }

                // Extract mentions from description and fields
                const mentionExtractor = /<@!?(\d+)>/g;
                const mentions = new Set();

                // Check description for mentions
                if (embed.description) {
                    let match;
                    while ((match = mentionExtractor.exec(embed.description)) !== null) {
                        mentions.add(match[1]);
                    }
                }

                // Check fields for mentions
                if (embed.fields && embed.fields.length > 0) {
                    for (const field of embed.fields) {
                        let match;
                        while ((match = mentionExtractor.exec(field.value)) !== null) {
                            mentions.add(match[1]);
                        }
                    }
                }

                if (mentions.size > 0) {
                    embedData.mentions = Array.from(mentions);
                }

                // Extract currency values
                const currencyPattern = /⏣\s*([\d,]+)/g;
                const currencyValues = [];

                // Check description for currency
                if (embed.description) {
                    let match;
                    while ((match = currencyPattern.exec(embed.description)) !== null) {
                        currencyValues.push(parseInt(match[1].replace(/,/g, ''), 10));
                    }
                }

                // Check fields for currency
                if (embed.fields && embed.fields.length > 0) {
                    for (const field of embed.fields) {
                        let match;
                        while ((match = currencyPattern.exec(field.value)) !== null) {
                            currencyValues.push(parseInt(match[1].replace(/,/g, ''), 10));
                        }
                    }
                }

                if (currencyValues.length > 0) {
                    embedData.currencyValues = currencyValues;
                }

                // Extract donation related information
                if (embed.description && embed.description.includes('donate')) {
                    const donationMatch = embed.description.match(/donated\s*\*\*⏣\s*([\d,]+)\*\*/i);
                    if (donationMatch) {
                        embedData.donationAmount = parseInt(donationMatch[1].replace(/,/g, ''), 10);
                    }
                }

                results.push(embedData);
            }

            // Create a nice looking embed to display the information
            const responseEmbed = new EmbedBuilder()
                .setTitle('<:lbtest:1064919048242090054> Embed Information')
                .setColor('#4c00b0')
                .setDescription(`Found ${results.length} embed(s) in the message.`)
                .setTimestamp();

            for (let i = 0; i < results.length; i++) {
                const data = results[i];
                let infoText = '';

                // Add basic info
                if (data.title) infoText += `**Title:** ${data.title}\n`;
                if (data.description) {
                    // Truncate description if too long
                    const truncatedDesc = data.description.length > 500
                        ? data.description.substring(0, 497) + '...'
                        : data.description;
                    infoText += `**Description:** ${truncatedDesc}\n`;
                }
                if (data.color) infoText += `**Color:** #${data.color}\n`;

                // Add author info
                if (data.author) {
                    infoText += `**Author:** ${data.author.name || 'N/A'}\n`;
                }

                // Add footer info
                if (data.footer && data.footer.text) {
                    infoText += `**Footer:** ${data.footer.text}\n`;
                }

                // Add mentions
                if (data.mentions && data.mentions.length > 0) {
                    infoText += `**Mentions:** ${data.mentions.map(id => `<@${id}>`).join(', ')}\n`;
                }

                // Add currency values
                if (data.currencyValues && data.currencyValues.length > 0) {
                    infoText += `**Currency Values:** ${data.currencyValues.map(val => `⏣ ${val.toLocaleString()}`).join(', ')}\n`;
                }

                // Add donation amount if found
                if (data.donationAmount) {
                    infoText += `**Donation Amount:** ⏣ ${data.donationAmount.toLocaleString()}\n`;
                }

                // Add fields count
                if (data.fields && data.fields.length > 0) {
                    infoText += `**Fields:** ${data.fields.length} field(s)\n`;
                }

                // JSON representation for more technical users
                const jsonData = JSON.stringify(data, null, 2);
                const truncatedJson = jsonData.length > 1000
                    ? jsonData.substring(0, 997) + '...'
                    : jsonData;

                responseEmbed.addFields(
                    { name: `<:purpledot:860074414853586984> Embed #${i + 1} Information`, value: infoText || 'No extractable data' },
                    { name: `<:YJ_streak:1259258046924853421> Raw Data (JSON)`, value: `\`\`\`json\n${truncatedJson}\n\`\`\`` }
                );
            }

            return message.reply({ embeds: [responseEmbed] });
        } catch (error) {
            console.error('Error in embed-info command:', error);
            return message.reply({
                content: `<:xmark:934659388386451516> An error occurred while extracting embed information: ${error.message}`
            });
        }
    },
};