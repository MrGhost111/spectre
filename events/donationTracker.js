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
                            const notificationMsg = await message.channel.send({ embeds: [donationEmbed] });

                            // Start polling for confirmation
                            const pollInterval = setInterval(async () => {
                                try {
                                    // Fetch the latest version of the message
                                    const updatedMessage = await message.channel.messages.fetch(message.id);

                                    // Check if the message has been updated to show confirmation
                                    if (updatedMessage.components?.length > 0 &&
                                        updatedMessage.components[0].components?.some(c =>
                                            c.type === 10 && c.content.includes('Successfully donated')
                                        )) {

                                        // Clear the polling interval
                                        clearInterval(pollInterval);

                                        // Update our notification embed
                                        const successEmbed = new EmbedBuilder()
                                            .setColor('#00ff00')
                                            .setTitle('Donation Confirmed!')
                                            .setDescription(`<@${donorId}> has successfully donated **⏣ ${donationAmount}** coins!`)
                                            .setFooter({
                                                text: `Donor: ${donorTag} | ID: ${donorId}`
                                            })
                                            .setTimestamp();

                                        await notificationMsg.edit({ embeds: [successEmbed] });

                                        // Here you can add any additional processing for confirmed donations
                                        console.log(`Donation confirmed: ${donationAmount} by ${donorId}`);
                                    }
                                } catch (error) {
                                    console.error('Error polling for donation confirmation:', error);
                                    clearInterval(pollInterval);
                                }
                            }, 1000); // Check every second

                            // Stop polling after 30 seconds
                            setTimeout(() => {
                                clearInterval(pollInterval);
                            }, 30000);

                            // Track this donation
                            client.trackedDonations = client.trackedDonations || new Map();
                            client.trackedDonations.set(message.id, {
                                originalMessage: message,
                                user: donorId,
                                amount: donationAmount,
                                pollInterval: pollInterval,
                                notificationMsg: notificationMsg
                            });

                            console.log(`Tracking pending donation: Message ID ${message.id}, User ${donorId}, Amount ${donationAmount}`);
                        }
                    }
                } catch (error) {
                    console.error('Error processing donation embed:', error);
                }
            }
        }

        // Also check if this is a confirmed donation (in case bot restarted during polling)
        if (message.author.id === DANK_MEMER_BOT_ID &&
            message.channel.id === TRANSACTION_CHANNEL_ID &&
            message.components?.length > 0 &&
            message.components[0].components?.some(c =>
                c.type === 10 && c.content.includes('Successfully donated')
            )) {

            // This is a confirmed donation message
            const interaction = message.interaction;
            if (interaction?.user) {
                const donorId = interaction.user.id;
                const donorTag = interaction.user.tag;

                // Extract amount from the success message
                const amountMatch = message.components[0].components[0].content.match(/Successfully donated \*\*⏣ ([0-9,]+)\*\*/);
                if (amountMatch) {
                    const donationAmount = amountMatch[1];

                    // Create confirmation embed
                    const successEmbed = new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle('Donation Confirmed!')
                        .setDescription(`<@${donorId}> has successfully donated **⏣ ${donationAmount}** coins!`)
                        .setFooter({
                            text: `Donor: ${donorTag} | ID: ${donorId}`
                        })
                        .setTimestamp();

                    await message.channel.send({ embeds: [successEmbed] });

                    console.log(`Detected confirmed donation: ${donationAmount} by ${donorId}`);
                }
            }
        }
    }
};