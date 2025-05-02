const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'donationTracker',
    async execute(client, message) {
        const DANK_MEMER_BOT_ID = '270904126974590976';
        const TRANSACTION_CHANNEL_ID = '833246120389902356';

        if (message.author.id !== DANK_MEMER_BOT_ID || message.channel.id !== TRANSACTION_CHANNEL_ID) return;

        if (message.embeds?.[0]?.description?.includes('Are you sure you want to donate your coins?')) {
            const amountMatch = message.embeds[0].description.match(/donate \*\*⏣ ([0-9,]+)\*\*/);
            if (!amountMatch) return;

            const donor = message.interaction?.user;
            if (!donor) return;

            // Extract initial message data
            const extractMessageData = (msg) => ({
                content: msg.content || "No standard content",
                embeds: msg.embeds.length > 0 ? msg.embeds : "No traditional embeds",
                components: msg.components.length > 0 ? msg.components : "No components",
                attachments: msg.attachments.size > 0 ? [...msg.attachments.values()] : "No attachments",
                stickers: msg.stickers.size > 0 ? [...msg.stickers.values()] : "No stickers",
                reactions: msg.reactions.cache.size > 0 ? [...msg.reactions.values()] : "No reactions",
                flags: msg.flags.bitfield,
                type: msg.type,
                interaction: msg.interaction || "No interaction",
            });

            const rawDataInitial = extractMessageData(message);
            const jsonDataInitial = JSON.stringify(rawDataInitial, null, 2);
            const truncatedJsonInitial = jsonDataInitial.length > 1000 ? jsonDataInitial.substring(0, 997) + "..." : jsonDataInitial;

            // Initial debug embed
            const initialEmbed = new EmbedBuilder()
                .setTitle('🔍 Donation Tracking Started')
                .setColor('#ff4500')
                .setDescription(`Tracking donation from **${donor.tag}**.\nAmount: **⏣ ${amountMatch[1]}**\n\n**Extracted Message Data:**`)
                .setTimestamp()
                .addFields({ name: 'Initial Raw Data (JSON)', value: `\`\`\`json\n${truncatedJsonInitial}\n\`\`\`` });

            const sentMessage = await message.channel.send({ embeds: [initialEmbed] });

            // Wait 5 seconds, then fetch and compare the same message
            setTimeout(async () => {
                try {
                    const freshMsg = await message.channel.messages.fetch(message.id);
                    const rawDataUpdated = extractMessageData(freshMsg);
                    const jsonDataUpdated = JSON.stringify(rawDataUpdated, null, 2);
                    const truncatedJsonUpdated = jsonDataUpdated.length > 1000 ? jsonDataUpdated.substring(0, 997) + "..." : jsonDataUpdated;

                    const updatedEmbed = new EmbedBuilder()
                        .setTitle('🔄 Donation Data Update')
                        .setColor('#3498db')
                        .setDescription(`Checking donation status for **${donor.tag}**...\nAmount: **⏣ ${amountMatch[1]}**`)
                        .setTimestamp()
                        .addFields({ name: 'Updated Raw Data (JSON)', value: `\`\`\`json\n${truncatedJsonUpdated}\n\`\`\`` });

                    await message.channel.send({ embeds: [updatedEmbed] });
                } catch (error) {
                    await message.channel.send({
                        content: `<:xmark:934659388386451516> Error occurred while fetching updated message data:\n\`\`\`${error.stack}\`\`\``
                    });
                }
            }, 5000);
        }
    }
};