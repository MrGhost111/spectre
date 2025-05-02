const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'donationTracker',
    async execute(client, message) {
        const DANK_MEMER_BOT_ID = '270904126974590976';
        const TRANSACTION_CHANNEL_ID = '833246120389902356';

        // Check if this is a Dank Memer bot message in the transaction channel
        if (message.author.id !== DANK_MEMER_BOT_ID || message.channel.id !== TRANSACTION_CHANNEL_ID) {
            return;
        }

        try {
            // Check for initial donation confirmation embed
            if (message.embeds?.length > 0 &&
                message.embeds[0].description?.includes('Are you sure you want to donate your coins?')) {

                const embed = message.embeds[0];
                const amountMatch = embed.description.match(/donate \*\*⏣ ([0-9,]+)\*\*/);
                if (!amountMatch) return;

                const donationAmount = amountMatch[1];
                const donorId = message.interaction?.user?.id;
                const donorTag = message.interaction?.user?.tag || 'Unknown User';

                if (!donorId) return;

                // Create initial tracking embed
                const trackingEmbed = new EmbedBuilder()
                    .setColor('#FFA500') // Orange for pending
                    .setTitle('⌛ Donation Pending Confirmation')
                    .setDescription(`<@${donorId}> is attempting to donate **⏣ ${donationAmount}**`)
                    .setFooter({ text: `Tracking donation confirmation...` })
                    .setTimestamp();

                const trackingMsg = await message.channel.send({ embeds: [trackingEmbed] });

                // Start polling for confirmation
                const pollInterval = setInterval(async () => {
                    try {
                        // Fetch fresh message data
                        const freshMessage = await message.channel.messages.fetch(message.id);

                        // Check for confirmation state
                        const isConfirmed = this.checkForDonationConfirmation(freshMessage);
                        if (isConfirmed) {
                            clearInterval(pollInterval);

                            // Update tracking embed
                            const successEmbed = new EmbedBuilder()
                                .setColor('#00FF00') // Green for success
                                .setTitle('✅ Donation Confirmed!')
                                .setDescription(`<@${donorId}> successfully donated **⏣ ${donationAmount}**`)
                                .setFooter({ text: `Donation completed at` })
                                .setTimestamp();

                            await trackingMsg.edit({ embeds: [successEmbed] });

                            // Here you can add any additional donation processing
                            console.log(`Donation confirmed: ${donationAmount} by ${donorId}`);
                        }
                    } catch (error) {
                        console.error('Polling error:', error);
                        clearInterval(pollInterval);
                    }
                }, 1000); // Check every second

                // Auto-cleanup after 30 seconds
                setTimeout(() => {
                    clearInterval(pollInterval);
                }, 30000);

                // Store tracking info
                client.trackedDonations = client.trackedDonations || new Map();
                client.trackedDonations.set(message.id, {
                    originalMessage: message,
                    donorId,
                    amount: donationAmount,
                    pollInterval,
                    trackingMsg
                });
            }

            // Also check for already-confirmed donations (in case we missed the transition)
            const isConfirmed = this.checkForDonationConfirmation(message);
            if (isConfirmed && message.interaction?.user) {
                const donorId = message.interaction.user.id;
                const donorTag = message.interaction.user.tag;
                const amountMatch = message.components[0]?.components[0]?.content?.match(/Successfully donated \*\*⏣ ([0-9,]+)\*\*/);

                if (amountMatch) {
                    const donationAmount = amountMatch[1];

                    const successEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('✅ Donation Processed')
                        .setDescription(`<@${donorId}> donated **⏣ ${donationAmount}**`)
                        .setFooter({ text: `Detected after confirmation` })
                        .setTimestamp();

                    await message.channel.send({ embeds: [successEmbed] });
                }
            }

        } catch (error) {
            console.error('Donation tracking error:', error);
        }
    },

    // Helper method to check for donation confirmation
    checkForDonationConfirmation(message) {
        // Check for the specific confirmation pattern in components
        return (
            message.components?.length > 0 &&
            message.components[0].components?.some(component =>
                component.type === 10 && // Type 10 = text component
                component.content?.includes('Successfully donated') &&
                component.content?.includes('⏣')
            )
        );
    }
};