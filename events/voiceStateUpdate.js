const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const dataPath = path.join(__dirname, '../data/ltl-events.json');

function formatDuration(ms, isActive = false) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));

    let duration = '';
    if (days > 0) duration += `${days}d `;
    if (hours > 0) duration += `${hours}h `;
    if (minutes > 0) duration += `${minutes}m `;
    duration += `${seconds}s`;
    
    return isActive ? `${duration}+` : duration;
}

async function updateStatusEmbed(client, eventData) {
    try {
        const channel = await client.channels.fetch(eventData.logChannelId);
        const statusMessage = await channel.messages.fetch(eventData.statusMessageId);

        const activeParticipants = Object.values(eventData.participants).filter(p => p.status === 'active');
        const totalParticipants = Object.keys(eventData.participants).length;
        const duration = formatDuration(Date.now() - eventData.startTime);

        // Sort participants: active first, then by leave time (latest leavers first)
        const sortedParticipants = Object.values(eventData.participants)
            .sort((a, b) => {
                if (a.status === 'active' && b.status === 'active') return 0;
                if (a.status === 'active') return -1;
                if (b.status === 'active') return 1;
                return (b.leaveTime || Date.now()) - (a.leaveTime || Date.now());
            });

        const statusEmbed = new EmbedBuilder()
            .setTitle('<:power:1064835342160625784>  Last to Leave Event - Active')
            .setDescription(`Event Started: <t:${Math.floor(eventData.startTime / 1000)}:F>\n\n<:time:1000024854478721125>  Event Duration: ${duration}\n<:user:1273754877646082048>  Participants Remaining: ${activeParticipants.length}/${totalParticipants}`)
            .setColor('#FF0000')
            .setTimestamp();

        let participantsList = '';
        sortedParticipants.forEach(participant => {
            const status = participant.status === 'active' ? '<a:tick:1276746433495830620>' : '<a:crossmark:1276746067026903061>';
            const timeSpent = participant.status === 'active' ? 
                `(${formatDuration(Date.now() - participant.joinTime, true)})` : 
                `(${formatDuration(participant.leaveTime - participant.joinTime)})`;
            participantsList += `${status} ${participant.username} ${timeSpent}\n`;
        });

        statusEmbed.setDescription(statusEmbed.data.description + `\n\n<:user:1273754877646082048>  Participants Status:\n${participantsList || 'No participants'}`);

        await statusMessage.edit({ embeds: [statusEmbed] });
    } catch (error) {
        console.error('Error updating status embed:', error);
    }
}

async function updateWinnerMessage(client, eventData, messageId) {
    try {
        const channel = await client.channels.fetch(eventData.logChannelId);
        const winnerMessage = await channel.messages.fetch(messageId);

        const sortedParticipants = Object.values(eventData.participants)
            .sort((a, b) => {
                const aTime = a.leaveTime || Date.now();
                const bTime = b.leaveTime || Date.now();
                return (bTime - b.joinTime) - (aTime - a.joinTime);
            });

        const totalDuration = formatDuration(Date.now() - eventData.startTime);

        let winnerDescription = `Event Duration: **${totalDuration}**\nEvent Status: Active\n\n`;
        
        // Add winner
        const winner = sortedParticipants[0];
        const winnerDuration = formatDuration(
            (winner.leaveTime || Date.now()) - winner.joinTime,
            winner.status === 'active'
        );
        winnerDescription += `<a:one_:1311073131905024040> **First Place:** [${winner.username}](https://discord.gg/dankest)\nTime: **${winnerDuration}**\n\n`;

        if (sortedParticipants.length > 1) {
            const second = sortedParticipants[1];
            const secondDuration = formatDuration(second.leaveTime - second.joinTime);
            winnerDescription += `<a:two_:1311075222312718346> **Second Place:** [${second.username}](https://discord.gg/dankest)\nTime: **${secondDuration}**\n\n`;
        }

        if (sortedParticipants.length > 2) {
            const third = sortedParticipants[2];
            const thirdDuration = formatDuration(third.leaveTime - third.joinTime);
            winnerDescription += `<a:three_:1311075241283424380> **Third Place:** [${third.username}](https://discord.gg/dankest)\nTime: **${thirdDuration}**\n\n`;
        }

        const winnerEmbed = new EmbedBuilder()
            .setTitle('<a:dommunism:827196255288950847> Last to Leave Event - Winner Announced')
            .setDescription(winnerDescription)
            .setColor('#FFD700')
            .setTimestamp();

        await winnerMessage.edit({ embeds: [winnerEmbed] });
    } catch (error) {
        console.error('Error updating winner message:', error);
    }
}

async function announceWinner(client, eventData, voiceChannelId) {
    try {
        const channel = await client.channels.fetch(eventData.logChannelId);

        const sortedParticipants = Object.values(eventData.participants)
            .sort((a, b) => {
                const aTime = a.leaveTime || Date.now();
                const bTime = b.leaveTime || Date.now();
                return (bTime - b.joinTime) - (aTime - a.joinTime);
            });

        const totalDuration = formatDuration(Date.now() - eventData.startTime);

        let winnerDescription = `Event Duration: **${totalDuration}**\nEvent Status: Active\n\n`;
        
        // Add participants
        for (let i = 0; i < Math.min(3, sortedParticipants.length); i++) {
            const participant = sortedParticipants[i];
            const duration = formatDuration(
                (participant.leaveTime || Date.now()) - participant.joinTime,
                participant.status === 'active'
            );
            const place = i === 0 ? 'one_' : i === 1 ? 'two_' : 'three_';
            const placeName = i === 0 ? 'First' : i === 1 ? 'Second' : 'Third';
            winnerDescription += `<a:${place}:${i === 0 ? '1311073131905024040' : i === 1 ? '1311075222312718346' : '1311075241283424380'}> **${placeName} Place:** [${participant.username}](https://discord.gg/dankest)\nTime: **${duration}**\n\n`;
        }

        const winnerEmbed = new EmbedBuilder()
            .setTitle('<a:dommunism:827196255288950847> Last to Leave Event - Winner Announced')
            .setDescription(winnerDescription)
            .setColor('#FFD700')
            .setTimestamp();

        const winnerMessage = await channel.send({ embeds: [winnerEmbed] });
        eventData.winnerMessageId = winnerMessage.id;
        
        return winnerMessage.id;
    } catch (error) {
        console.error('Error announcing winner:', error);
    }
}

module.exports = {
    name: 'voiceStateUpdate',
    async execute(client, oldState, newState) {
        try {
            if (!fs.existsSync(dataPath)) return;
            
            const eventsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            
            // Check if user is in an active event channel
            const relevantChannelId = oldState.channelId || newState.channelId;
            if (relevantChannelId && eventsData[relevantChannelId]) {
                const eventData = eventsData[relevantChannelId];
                
                // Only process if event is active
                if (eventData.status === 'active') {
                    const userId = oldState.member.id;
                    
                    // Handle channel leave
                    if (oldState.channelId && !newState.channelId && eventData.participants[userId]) {
                        eventData.participants[userId].status = 'left';
                        eventData.participants[userId].leaveTime = Date.now();
                        
                        // Count remaining active participants
                        const activeParticipants = Object.values(eventData.participants)
                            .filter(p => p.status === 'active');

                        // Update status embed
                        await updateStatusEmbed(client, eventData);

                        // Check if only one participant remains
                        if (activeParticipants.length === 1 && !eventData.winnerMessageId) {
                            const winnerMessageId = await announceWinner(client, eventData, oldState.channelId);
                            eventData.winnerMessageId = winnerMessageId;
                        }
                    }
                    // Update durations on any voice state change for active participants
                    else if (eventData.participants[userId] && eventData.participants[userId].status === 'active') {
                        // Update status embed
                        await updateStatusEmbed(client, eventData);
                        
                        // Update winner message if exists
                        if (eventData.winnerMessageId) {
                            await updateWinnerMessage(client, eventData, eventData.winnerMessageId);
                        }
                    }
                    
                    // Save updated event data
                    eventsData[relevantChannelId] = eventData;
                    fs.writeFileSync(dataPath, JSON.stringify(eventsData, null, 2));
                }
            }
        } catch (error) {
            console.error('Error in voiceStateUpdate:', error);
        }
    }
};
