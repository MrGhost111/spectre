module.exports = {
    name: 'messageCreate',
    async execute(client, message) {
        if (message.author.bot) return;

        try {
            const { handleIdChannelMessage } = require('../functions/wos/Players/idChannel');
            await handleIdChannelMessage(message);
        } catch (error) {
            console.error('[WOS] Error handling ID channel message:', error);
        }

        try {
            const { handleGiftCodeChannelMessage } = require('../functions/wos/GiftCode/giftCodeChannel');
            await handleGiftCodeChannelMessage(message);
        } catch (error) {
            console.error('[WOS] Error handling gift code channel message:', error);
        }
    }
};