const { processDonation, checkComponentsForDonation, updateStatusBoard } = require('../utils/donationSystem');

module.exports = {
    name: 'donationTracker',
    async execute(client, message) {
        const DANK_MEMER_BOT_ID = '270904126974590976';
        const TRANSACTION_CHANNEL_ID = '833246120389902356';

        if (message.author.id !== DANK_MEMER_BOT_ID || message.channel.id !== TRANSACTION_CHANNEL_ID) return;

        if (message.embeds?.[0]?.description?.includes('Are you sure you want to donate your coins?')) {
            const donorId = message.interaction?.user?.id;
            if (!donorId) return;

            const amountMatch = message.embeds[0].description.match(/donate \*\*⏣ ([0-9,]+)\*\*/);
            if (!amountMatch) return;

            // Poll for donation confirmation every second
            const checkInterval = setInterval(async () => {
                try {
                    const freshMsg = await message.channel.messages.fetch(message.id);
                    const donationData = checkComponentsForDonation(freshMsg);

                    if (donationData) {
                        clearInterval(checkInterval);

                        // Update JSON & send donation embed
                        await processDonation(client, message, donationData.amount, donorId);

                        // Update status board .
                        await updateStatusBoard(client);
                    }
                } catch (error) {
                    console.error('Error checking donation confirmation:', error);
                    clearInterval(checkInterval);
                }
            }, 1000);
        }
    }
};