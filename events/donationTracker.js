const { processDonation, updateStatusBoard } = require('../utils/donationSystem');

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

            // Poll every second until confirmation is detected
            const checkInterval = setInterval(async () => {
                try {
                    const freshMsg = await message.channel.messages.fetch(message.id);

                    // Directly check the components for the confirmation message
                    const confirmed = freshMsg.components?.some(comp =>
                        comp.components?.some(sub => sub.content?.includes("Successfully donated"))
                    );

                    if (confirmed) {
                        clearInterval(checkInterval);

                        const donationAmount = parseInt(amountMatch[1].replace(/,/g, ''), 10);

                        // Update JSON & status board
                        await processDonation(client, message, donationAmount, donorId);
                        await updateStatusBoard(client);

                        // Send simple confirmation message
                        await message.channel.send(`✅ **Donation Confirmed!** User: <@${donorId}> | Amount: ⏣ ${donationAmount}`);
                    }
                } catch (error) {
                    clearInterval(checkInterval);
                    console.error('Error checking donation confirmation:', error);
                }
            }, 1000); // Poll every second
        }
    }
};