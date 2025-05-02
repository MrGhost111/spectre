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

            const initialDebug = await message.channel.send({
                content: `**DONATION DETECTED**\nTracking message ${message.id}\nDonor: ${donor.tag}\nAmount: ${amountMatch[1]}\n\nPolling for confirmation...`
            });

            let confirmationDetected = false;

            const checkInterval = setInterval(async () => {
                try {
                    const freshMsg = await message.channel.messages.fetch(message.id);

                    // Check if the message has no traditional embeds and contains the confirmation text in components
                    const donationConfirmed = freshMsg.components?.some(comp =>
                        comp.components?.some(sub => sub.content?.includes("Successfully donated"))
                    );

                    if (donationConfirmed) {
                        confirmationDetected = true;
                        clearInterval(checkInterval);

                        await message.channel.send({
                            content: `✅ **DONATION CONFIRMED**\nDonor: ${donor.tag}\nAmount: ${amountMatch[1]}\nMessage ID: ${message.id}`
                        });

                        await initialDebug.delete().catch(() => {
                            message.channel.send({ content: "⚠ Failed to delete debug message." });
                        });
                    }
                } catch (error) {
                    await message.channel.send({
                        content: `⚠ **ERROR DETECTED**\n\`\`\`${error.stack}\`\`\``
                    });
                    clearInterval(checkInterval);
                }
            }, 1000); // Poll every second

            setInterval(async () => {
                if (confirmationDetected) {
                    await message.channel.send({
                        content: `🔄 **DONATION UPDATE**\nDonation by ${donor.tag} of ⏣ ${amountMatch[1]} was confirmed earlier.\nTracking message: ${message.id}`
                    });
                }
            }, 10000); // Send updates every 10 seconds
        }
    }
};