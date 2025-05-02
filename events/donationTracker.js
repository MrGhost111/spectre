const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'donationTracker',
    async execute(client, message) {
        const DANK_MEMER_BOT_ID = '270904126974590976';
        const TRANSACTION_CHANNEL_ID = '833246120389902356';

        // 1. Quick exit if not the right message
        if (message.author.id !== DANK_MEMER_BOT_ID || message.channel.id !== TRANSACTION_CHANNEL_ID) return;

        // 2. Detect initial donation prompt
        if (message.embeds?.[0]?.description?.includes('Are you sure you want to donate your coins?')) {
            const amountMatch = message.embeds[0].description.match(/donate \*\*⏣ ([0-9,]+)\*\*/);
            if (!amountMatch) return;

            const donor = message.interaction?.user;
            if (!donor) return;

            // 3. Send initial debug message with raw data
            const initialDebug = await message.channel.send({
                content: `**DONATION DETECTED**\nTracking message ${message.id}\nDonor: ${donor.tag}\nAmount: ${amountMatch[1]}\n\nPolling for confirmation...`
            });

            // 4. Start checking every 10 seconds
            const checkInterval = setInterval(async () => {
                try {
                    const freshMsg = await message.channel.messages.fetch(message.id);

                    // 5. Send debug comparison every check
                    const debugMsg = await message.channel.send({
                        content: `**POLLING CHECK**\nMessage ${message.id} status:\n` +
                            `- Has embed: ${freshMsg.embeds.length > 0}\n` +
                            `- Has components: ${freshMsg.components.length > 0}\n` +
                            `- First component type: ${freshMsg.components[0]?.components[0]?.type || 'N/A'}`
                    });

                    // 6. Check for confirmation conditions
                    if (freshMsg.embeds.length === 0 &&
                        freshMsg.components?.[0]?.components?.[0]?.type === 10 &&
                        freshMsg.components[0].components[0].content.includes('Successfully donated')) {

                        clearInterval(checkInterval);

                        // 7. Send final confirmation
                        await message.channel.send({
                            content: `**DONATION CONFIRMED**\n` +
                                `Donor: ${donor.tag}\n` +
                                `Amount: ${amountMatch[1]}\n` +
                                `Message ID: ${message.id}`
                        });

                        // Clean up debug messages
                        await initialDebug.delete().catch(console.error);
                        await debugMsg.delete().catch(console.error);
                    }
                } catch (error) {
                    console.error('Polling error:', error);
                    clearInterval(checkInterval);
                }
            }, 10000); // Check every 10 seconds

            // 8. Timeout after 30 seconds (3 checks)
            setTimeout(async () => {
                clearInterval(checkInterval);
                const exists = await message.channel.messages.fetch(message.id).catch(() => null);

                if (exists && exists.embeds.length > 0) {
                    await message.channel.send({
                        content: `**DONATION TIMED OUT**\n` +
                            `Message ${message.id} was not confirmed within 30 seconds`
                    });
                }
            }, 30000);
        }
    }
};