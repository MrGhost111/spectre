const fs = require('fs');
const path = require('path');
const { updateStatusMessage, announceWinner } = require('../utils/helpers');

const dataPath = path.join(__dirname, '../data/ltl-events.json');

module.exports = {
    name: 'voiceStateUpdate',
    async execute(client, oldState, newState) {
        try {
            if (!fs.existsSync(dataPath)) return;
            
            const eventsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            const relevantChannelId = oldState.channelId || newState.channelId;
            
            if (relevantChannelId && eventsData[relevantChannelId]) {
                const eventData = eventsData[relevantChannelId];
                
                if (eventData.status === 'active') {
                    const userId = oldState.member.id;
                    
                    if (oldState.channelId && !newState.channelId && eventData.participants[userId]) {
                        eventData.participants[userId].status = 'left';
                        eventData.participants[userId].leaveTime = Date.now();
                        
                        const activeParticipants = Object.values(eventData.participants)
                            .filter(p => p.status === 'active');

                        await updateStatusMessage(client, eventData);

                        if (activeParticipants.length === 1 && !eventData.winnerMessageId) {
                            await announceWinner(client, eventData);
                        }
                    } else if (eventData.participants[userId] && eventData.participants[userId].status === 'active') {
                        await updateStatusMessage(client, eventData);
                    }
                    
                    eventsData[relevantChannelId] = eventData;
                    fs.writeFileSync(dataPath, JSON.stringify(eventsData, null, 2));
                }
            }
        } catch (error) {
            console.error('Error in voiceStateUpdate:', error);
        }
    }
};
