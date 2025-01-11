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
            
            if (!relevantChannelId || !eventsData[relevantChannelId]) return;
            
            const eventData = eventsData[relevantChannelId];
            if (eventData.status !== 'active') return;
            
            const userId = oldState.member.id;
            const participant = eventData.participants[userId];
            
            // Handle participant leaving the channel
            if (oldState.channelId === relevantChannelId && newState.channelId !== relevantChannelId) {
                if (participant && participant.status === 'active') {
                    participant.status = 'left';
                    participant.leaveTime = Date.now();
                    
                    const activeParticipants = Object.values(eventData.participants)
                        .filter(p => p.status === 'active');
                    
                    // Announce places for top 3
                    if (activeParticipants.length <= 2) {
                        const place = activeParticipants.length + 1;
                        if (place <= 3) {
                            await announcePlace(client, eventData, participant, place);
                        }
                    }
                    
                    // Check for winner
                    if (activeParticipants.length === 1 && !eventData.winnerMessageId) {
                        await announceWinner(client, eventData);
                    }
                }
            }
            // Handle participant joining the channel
            else if (oldState.channelId !== relevantChannelId && newState.channelId === relevantChannelId) {
                // Don't allow new participants to join if event is active
                if (!participant) {
                    await newState.disconnect();
                    return;
                }
            }
            // Handle voice state changes (mute/unmute/deafen)
            else if (
                newState.channelId === relevantChannelId &&
                participant &&
                participant.status === 'active' &&
                (oldState.mute !== newState.mute ||
                 oldState.deaf !== newState.deaf ||
                 oldState.selfMute !== newState.selfMute ||
                 oldState.selfDeaf !== newState.selfDeaf ||
                 oldState.streaming !== newState.streaming ||
                 oldState.serverMute !== newState.serverMute ||
                 oldState.serverDeaf !== newState.serverDeaf)
            ) {
                // Update status for any voice state change
                participant.lastStateUpdate = Date.now();
            }
            
            // Always update the status message when any change occurs
            await updateStatusMessage(client, eventData);
            
            // Save the updated event data
            eventsData[relevantChannelId] = eventData;
            fs.writeFileSync(dataPath, JSON.stringify(eventsData, null, 2));
            
        } catch (error) {
            console.error('Error in voiceStateUpdate:', error);
        }
    }
};
