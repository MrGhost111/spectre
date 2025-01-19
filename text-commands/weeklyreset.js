const { weeklyReset } = require('../events/mupdate.js');

module.exports = {
    name: 'resetweekly',
    description: 'Manually trigger the weekly reset for donations',
    async execute(message, args) {
        // Check if user has admin permissions
        if (!message.member.permissions.has('Administrator')) {
            return message.reply('You need Administrator permissions to use this command.');
        }
        
        try {
            // Send initial response
            const response = await message.reply('<:infom:1064823078162538497> Starting weekly reset...');
            
            // Execute weekly reset
            await weeklyReset(message.client);
            
            // Update response with success message
            await response.edit('<:GreenTick:864757985917665300> Weekly reset completed successfully!');
        } catch (error) {
            console.error('Error during manual weekly reset:', error);
            await message.reply('<:xmark:934659388386451516> An error occurred during the weekly reset. Please check the logs.');
        }
    }
};
