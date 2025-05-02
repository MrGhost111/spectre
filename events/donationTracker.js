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

            setTimeout(async () => {
                let attempts = 0;
                const checkInterval = setInterval(async () => {
                    if (attempts >= 6) {
                        clearInterval(checkInterval);
                        return;
                    }

                    try {
                        const freshMsg = await message.channel.messages.fetch(message.id);
                        const rawDataUpdated = extractMessageData(freshMsg);

                        // Check if the new data includes the component type 10 with the success message
                        const hasDonationConfirmation = rawDataUpdated.components.some(comp =>
                            comp.type === 10 && comp.components.some(subComp =>
                                subComp.content?.includes("Successfully donated")
                            )
                        );

                        if (hasDonationConfirmation) {
                            clearInterval(checkInterval);
                            await message.channel.send({ content: `✅ Donation confirmed! ${donor.tag} successfully donated **⏣ ${amountMatch[1]}**.` });
                        }
                    } catch (error) {
                        console.error("Error while fetching updated message:", error);
                    }

                    attempts++;
                }, 5000);
            }, 5000);
        }
    }
};