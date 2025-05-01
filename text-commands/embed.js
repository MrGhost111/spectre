const { inspect } = require('util');
const { checkComponentsForDonation } = require('../utils/donationSystem');

module.exports = {
    name: 'embed',
    description: 'Debug donation detection',
    async execute(message) {
        const targetMessage = message.reference?.messageId
            ? await message.channel.messages.fetch(message.reference.messageId)
            : message;

        console.log('Message components:', inspect(targetMessage.components, { depth: null }));
        console.log('Message embeds:', inspect(targetMessage.embeds, { depth: null }));

        const donationData = await checkComponentsForDonation(targetMessage);

        if (donationData) {
            message.reply(`✅ Detected donation: ${donationData.amount} from <@${donationData.donorId}>`);
        } else {
            message.reply('❌ No donation detected in this message');
        }
    }
};