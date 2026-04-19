// JavaScript source code
// Donations/donationTracker.js
// Listens for Dank Memer donation confirmations (edited messages in the
// transaction channel) and records them via noteSystem.js.
//
// This runs ALONGSIDE mupdate.js — both can react to the same message edit.
// mupdate.js handles Money Makers weekly tracking.
// donationTracker.js handles the global all-time donation system.
//
// HOW TO HOOK THIS IN index.js:
//
//   const donationTracker = require('./Donations/donationTracker');
//
//   client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
//       donationTracker.execute(client, oldMessage, newMessage);
//   });
//
// Or if you already have a MessageUpdate handler that calls modules,
// just add:  donationTracker.execute(client, oldMessage, newMessage);

const {
    findDonor,
    recordDonation,
    TRANSACTION_CHANNEL_ID,
    DANK_MEMER_BOT_ID,
} = require('./noteSystem');

module.exports = {
    name: 'donationTracker',

    async execute(client, oldMessage, newMessage) {
        try {
            // Only care about Dank Memer edits in the transaction channel
            
            if (newMessage.author?.id !== DANK_MEMER_BOT_ID) return;
            if (!newMessage.embeds?.length) return;

            const embed = newMessage.embeds[0];
            if (!embed.description?.includes('Successfully donated')) return;

            // Parse amount
            const match = embed.description.match(
                /Successfully donated \*\*⏣\s*([\d,]+)\*\*/
            );
            if (!match) {
                console.warn('[DonationTracker] Could not parse amount from:', embed.description);
                return;
            }

            const donationAmount = parseInt(match[1].replace(/,/g, ''), 10);
            if (isNaN(donationAmount) || donationAmount <= 0) {
                console.warn('[DonationTracker] Invalid parsed amount:', match[1]);
                return;
            }

            // Resolve donor
            const donorId = await findDonor(newMessage);
            if (!donorId) {
                console.warn('[DonationTracker] Could not resolve donor for amount:', donationAmount);
                return;
            }

            // Record — this updates donations.json, handles milestone roles,
            // and posts the log embed
            await recordDonation(client, donorId, donationAmount);

        } catch (e) {
            console.error('[DonationTracker] Unhandled error:', e);
        }
    },
};