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
            
            // If this user isn't a participant, ignore the event
            if (!participant) return;

            // Handle disconnection
            if (oldState.channelId && !newState.channelId) {
                // User left the channel
                participant.status = 'left';
                participant.leaveTime = Date.now();
                
                const activeParticipants = Object.values(eventData.participants)
                    .filter(p => p.status === 'active');
                
                // Handle place announcements based on remaining participants
                if (activeParticipants.length === 2) {
                    // When 3rd place leaves
                    await announcePlace(client, eventData, participant, 3);
                } else if (activeParticipants.length === 1) {
                    // When 2nd place leaves
                    await announcePlace(client, eventData, participant, 2);
                    // Announce final results immediately after 2nd place
                    await announceWinner(client, eventData);
                } else if (activeParticipants.length === 0) {
                    // Winner left - just update status, no announcement
                    participant.status = 'left';
                    participant.leaveTime = Date.now();
                }
            } else if (
                oldState.channelId === newState.channelId && (
                    oldState.mute !== newState.mute ||
                    oldState.deaf !== newState.deaf ||
                    oldState.selfMute !== newState.selfMute ||
                    oldState.selfDeaf !== newState.selfDeaf
                )
            ) {
                // Voice state changed (mute/unmute/deafen) but still in channel
                participant.status = 'active';
            }

            // Always update status message after any change
            await updateStatusMessage(client, eventData);
            
            // Save updated event data
            eventsData[relevantChannelId] = eventData;
            fs.writeFileSync(dataPath, JSON.stringify(eventsData, null, 2));
            
        } catch (error) {
            console.error('Error in voiceStateUpdate:', error);
        }
    }
};
