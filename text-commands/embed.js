const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'embeddebug',
    aliases: ['edbg'],
    description: 'Debug: Extract raw message data to find hidden embed info.',
    async execute(message, args, client) {
        try {
            // Fetch target message (either replied or by ID)
            const targetMessage = await fetchTargetMessage(message, args);
            if (!targetMessage) {
                return sendErrorMessage(message,
                    'Please reply to a message or provide a valid message ID.'
                );
            }

            // Extract all message data
            const rawData = extractMessageData(targetMessage);

            // Build and send debug embed
            const responseEmbed = buildDebugEmbed(rawData);
            return message.reply({ embeds: [responseEmbed] });

        } catch (error) {
            console.error('Error in embed debug extraction:', error);
            return sendErrorMessage(message,
                `An error occurred while extracting message data: ${error.message}`
            );
        }
    },
};

// Helper Functions

async function fetchTargetMessage(message, args) {
    try {
        // Try to get message from reply reference
        if (message.reference) {
            return await message.channel.messages.fetch(message.reference.messageId);
        }

        // Try to get message from provided ID
        if (args.length > 0) {
            return await message.channel.messages.fetch(args[0]);
        }

        return null;
    } catch (fetchError) {
        console.error('Error fetching target message:', fetchError);
        return null;
    }
}

function extractMessageData(message) {
    return {
        // Basic message info
        id: message.id,
        createdTimestamp: message.createdTimestamp,
        type: message.type,
        flags: message.flags.bitfield,

        // Content
        content: message.content || "No standard content",

        // Embeds
        embeds: message.embeds.length > 0
            ? message.embeds.map(embed => ({
                title: embed.title,
                description: embed.description,
                fields: embed.fields,
                footer: embed.footer,
                color: embed.color
            }))
            : "No traditional embeds",

        // Components
        components: message.components.length > 0
            ? message.components.map(comp => ({
                type: comp.type,
                components: comp.components.map(c => ({
                    type: c.type,
                    customId: c.customId,
                    label: c.label,
                    style: c.style
                }))
            }))
            : "No components",

        // Attachments
        attachments: message.attachments.size > 0
            ? [...message.attachments.values()].map(a => ({
                name: a.name,
                url: a.url,
                contentType: a.contentType
            }))
            : "No attachments",

        // Other metadata
        stickers: message.stickers.size > 0
            ? [...message.stickers.values()].map(s => s.name)
            : "No stickers",

        reactions: message.reactions.cache.size > 0
            ? [...message.reactions.cache.values()].map(r => ({
                emoji: r.emoji.toString(),
                count: r.count
            }))
            : "No reactions",

        interaction: message.interaction
            ? {
                id: message.interaction.id,
                type: message.interaction.type,
                commandName: message.interaction.commandName,
                user: message.interaction.user.id
            }
            : "No interaction"
    };
}

function buildDebugEmbed(rawData) {
    const jsonData = JSON.stringify(rawData, null, 2);
    const truncatedJson = jsonData.length > 1000
        ? jsonData.substring(0, 997) + "..."
        : jsonData;

    return new EmbedBuilder()
        .setTitle('<:lbtest:1064919048242090054> Debug: Extracted Raw Message Data')
        .setColor('#ff4500')
        .setDescription("Here's everything extracted from the message.")
        .setTimestamp()
        .addFields({
            name: 'Raw Data (JSON)',
            value: `\`\`\`json\n${truncatedJson}\n\`\`\``
        });
}

function sendErrorMessage(message, text) {
    return message.reply({
        content: `<:xmark:934659388386451516> ${text}`
    });
}