// text-commands/resetweekly.js
const { weeklyReset } = require('../events/resetweekly');

module.exports = {
    name: 'resetweekly',
    description: 'Manually trigger the weekly reset for donations',
    async execute(message, args) {
        if (!message.member.permissions.has('Administrator')) {
            return message.reply('You need Administrator permissions to use this command.');
        }

        const response = await message.reply('<:infom:1064823078162538497> Starting weekly reset...');

        try {
            const success = await weeklyReset(message.client);
            if (success) {
                await response.edit('<:GreenTick:864757985917665300> Weekly reset completed successfully!');
            } else {
                await response.edit('<:xmark:934659388386451516> Weekly reset finished but with some errors. Check admin channel and logs.');
            }
        } catch (error) {
            console.error('[CMD] Error during manual weekly reset:', error);
            await response.edit('<:xmark:934659388386451516> A critical error occurred during the weekly reset. Check the logs.');
        }
    },
};