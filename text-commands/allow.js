const { PermissionsBitField } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    name: 'allow',
    description: 'Allows a new account from a specific user to join despite age restrictions.',
    async execute(message, args) {
        // Check if the command issuer has manage server permission
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return;
        }

        // Check if an ID is provided
        if (!args[0]) {
            return message.reply('Please provide a user ID to allow.');
        }

        const userId = args[0];
        
        // Validate if the input is a valid user ID format
        if (!/^\d{17,19}$/.test(userId)) {
            return message.reply('Please provide a valid user ID.');
        }

        try {
            // Read the current allow list
            const allowListPath = path.join(__dirname, '..', 'data', 'allow.json');
            let allowList = {};
            
            try {
                const data = await fs.readFile(allowListPath, 'utf8');
                allowList = JSON.parse(data);
            } catch (error) {
                // If file doesn't exist or is invalid, we'll start with an empty object
                if (error.code !== 'ENOENT') {
                    console.error('Error reading allow list:', error);
                }
            }

            // Add the user to the allow list
            allowList[userId] = {
                allowedAt: Date.now(),
                allowedBy: message.author.id
            };

            // Save the updated allow list
            await fs.writeFile(allowListPath, JSON.stringify(allowList, null, 2));

            // React with success emoji
            await message.react('<a:tickloop:926319357288648784>');
            
            // Send confirmation message
            await message.channel.send(`User ID \`${userId}\` has been added to the allow list.`);

        } catch (error) {
            console.error('Error in allow command:', error);
            message.reply('There was an error processing your request. Please try again later.');
        }
    },
};
