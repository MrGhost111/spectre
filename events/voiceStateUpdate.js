const fs = require('fs');
const path = require('path');
const { updateStatusMessage, announcePlace, announceWinner, startStatusUpdates } = require('../utils/helpers');
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

                    // Handle leaving the channel
                    if (oldState.channelId && !newState.channelId && eventData.participants[userId]) {
                        eventData.participants[userId].status = 'left';
                        eventData.participants[userId].leaveTime = Date.now();
                        
                        const activeParticipants = Object.values(eventData.participants)
                            .filter(p => p.status === 'active');
                        
                        // Announce places for top 3
                        if (activeParticipants.length <= 2) {
                            const place = activeParticipants.length + 1;
                            if (place <= 3) {
                                await announcePlace(client, eventData, eventData.participants[userId], place);
                            }
                        }
                        
                        await updateStatusMessage(client, eventData);
                        
                        if (activeParticipants.length === 1 && !eventData.winnerMessageId) {
                            await announceWinner(client, eventData);
                        }
                    } 
                    // Handle voice state changes (mute/unmute/deafen)
                    else if (eventData.participants[userId] && 
                        (oldState.mute !== newState.mute ||
                         oldState.deaf !== newState.deaf ||
                         oldState.selfMute !== newState.selfMute ||
                         oldState.selfDeaf !== newState.selfDeaf)) {
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
