const fs = require('fs');
const path = require('path');
const { startStatusUpdates } = require('../utils/helpers');
const dataPath = path.join(__dirname, '../data/ltl-events.json');
const HOST_ROLE_ID = '712970141834674207';

module.exports = {
    name: 'fixstatus',
    async execute(message, args) {
        if (!message.member.roles.cache.has(HOST_ROLE_ID)) {
            return message.reply('You do not have permission to manage Last to Leave events.');
        }

        try {
            const eventsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            
            for (const [channelId, eventData] of Object.entries(eventsData)) {
                if (eventData.status === 'active') {
                    startStatusUpdates(message.client, channelId, eventData);
                    return message.reply('Status updates have been restarted successfully!');
                }
            }
            
            return message.reply('No active events found to restart updates for.');
        } catch (error) {
            console.error('Error restarting updates:', error);
            return message.reply('An error occurred while trying to restart updates.');
        }
    }
};
