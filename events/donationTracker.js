// events/donationTracker.js
// Tracks ALL Dank Memer donations server-wide EXCEPT the transaction channel
// (which is already handled by mupdate.js for the Money Makers system).
//
// Mirrors the exact same detection logic as mupdate.js so it works reliably.

const { Events } = require('discord.js');
const { recordDonation, findDonor } = require('../Donations/noteSystem');

const TRANSACTION_CHANNEL_ID = '833246120389902356';
const DANK_MEMER_BOT_ID = '270904126974590976';

module.exports = {
    name: Events.MessageUpdate,

    async execute(client, oldMessage, newMessage) {
        try {
            // Ignore the transaction channel — mupdate.js already handles that
            if (newMessage.channel?.id === TRANSACTION_CHANNEL_ID) return;

            // Only care about Dank Memer
            if (newMessage.author?.id !== DANK_MEMER_BOT_ID) return;

            // Must have embeds
            if (!newMessage.embeds?.length) return;

            const embed = newMessage.embeds[0];
            if (!embed.description?.includes('Successfully donated')) return;

            // Parse donation amount — same regex as mupdate.js
            const donationMatch = embed.description.match(
                /Successfully donated \*\*⏣\s*([\d,]+)\*\*/
            );
            if (!donationMatch) {
                console.warn('[DonationTracker] Matched but regex failed. Description:', embed.description);
                return;
            }

            const donationAmount = parseInt(donationMatch[1].replace(/,/g, ''), 10);
            if (isNaN(donationAmount) || donationAmount <= 0) {
                console.warn('[DonationTracker] Invalid parsed amount:', donationMatch[1]);
                return;
            }

            // Resolve donor — same strategy as mupdate.js
            const donorId = await findDonor(newMessage);
            if (!donorId) {
                console.warn('[DonationTracker] Could not resolve donor for amount:', donationAmount);
                return;
            }

            console.log(`[DonationTracker] Detected donation of ${donationAmount} by ${donorId} in #${newMessage.channel.name}`);

            // Record it — updates donations.json, handles milestone roles, posts log embed
            await recordDonation(client, donorId, donationAmount);

        } catch (e) {
            console.error('[DonationTracker] Unhandled error:', e);
        }
    },
};