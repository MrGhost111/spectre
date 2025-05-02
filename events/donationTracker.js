const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'donationTracker',
    async execute(client, message) {
        const DANK_MEMER_BOT_ID = '270904126974590976';
        const TRANSACTION_CHANNEL_ID = '833246120389902356';

        if (message.author.id === DANK_MEMER_BOT_ID &&
            message.channel.id === TRANSACTION_CHANNEL_ID &&
            message.embeds?.length > 0) {

            const embed = message.embeds[0];

            // Check if this is a donation confirmation embed
            if (embed.description && embed.description.includes('Are you sure you want to donate your coins?')) {
                try {
                    // Extract the donation amount from the embed description
                    const amountMatch = embed.description.match(/donate \*\*⏣ ([0-9,]+)\*\*/);
                    if (amountMatch) {
                        const donationAmount = amountMatch[1];

                        // Get the user who initiated the interaction (the donor)
                        const donorId = message.interaction?.user?.id;
                        const donorTag = message.interaction?.user?.tag || 'Unknown User';

                        if (donorId) {
                            // Create a response embed
                            const donationEmbed = new EmbedBuilder()
                                .setColor('#2ecc71')
                                .setTitle('Donation Detected')
                                .setDescription(`<@${donorId}> is donating **⏣ ${donationAmount}** coins!`)
                                .setFooter({
                                    text: `Donor: ${donorTag} | ID: ${donorId}`
                                })
                                .setTimestamp();

                            // Send the donation notification
                            await message.channel.send({ embeds: [donationEmbed] });

                            // Track this donation for confirmation later
                            client.trackedDonations = client.trackedDonations || new Map();
                            client.trackedDonations.set(message.id, {
                                originalMessage: message,
                                user: donorId,
                                amount: donationAmount
                            });

                            console.log(`Tracking pending donation: Message ID ${message.id}, User ${donorId}, Amount ${donationAmount}`);
                        }
                    }
                } catch (error) {
                    console.error('Error processing donation embed:', error);
                }
            }
        }
    }
};