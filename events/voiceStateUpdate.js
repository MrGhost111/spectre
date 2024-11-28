const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const dataPath = path.join(__dirname, '../data/ltl-events.json');

function formatDuration(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));

    let duration = '';
    if (days > 0) duration += `${days}d `;
    if (hours > 0) duration += `${hours}h `;
    if (minutes > 0) duration += `${minutes}m `;
    duration += `${seconds}s`;

    return duration;
}

async function updateStatusEmbed(client, eventData) {
    try {
        const channel = await client.channels.fetch(eventData.logChannelId);
        const statusMessage = await channel.messages.fetch(eventData.statusMessageId);

        const activeParticipants = Object.values(eventData.participants).filter(p => p.status === 'active');
        const totalParticipants = Object.keys(eventData.participants).length;
        const duration = formatDuration(Date.now() - eventData.startTime);

        const statusEmbed = new EmbedBuilder()
            .setTitle('<:power:1064835342160625784>  Last to Leave Event - Active')
            .setDescription(`Event Started: <t:${Math.floor(eventData.startTime / 1000)}:F>\n\n<:time:1000024854478721125>  Event Duration: ${duration}\n<:user:1273754877646082048>  Participants Remaining: ${activeParticipants.length}/${totalParticipants}`)
            .setColor('#FF0000')
            .setTimestamp();

        let participantsList = '';
        Object.values(eventData.participants).forEach(participant => {
            const status = participant.status === 'active' ? '<a:tick:1276746433495830620>' : '<a:crossmark:1276746067026903061>';
            const timeSpent = participant.leaveTime ? 
                `(${formatDuration(participant.leaveTime - participant.joinTime)})` : 
                '(Active)';
            participantsList += `${status} ${participant.username} ${timeSpent}\n`;
        });

        statusEmbed.setDescription(statusEmbed.data.description + `\n\n<:user:1273754877646082048>  Participants Status:\n${participantsList || 'No participants'}`);

        await statusMessage.edit({ embeds: [statusEmbed] });
    } catch (error) {
        console.error('Error updating status embed:', error);
    }
}

async function endEvent(client, eventData, voiceChannelId) {
    try {
        const channel = await client.channels.fetch(eventData.logChannelId);
        const voiceChannel = await client.channels.fetch(voiceChannelId);

        const sortedParticipants = Object.values(eventData.participants)
            .sort((a, b) => {
                const aTime = a.leaveTime || Date.now();
                const bTime = b.leaveTime || Date.now();
                return (bTime - b.joinTime) - (aTime - a.joinTime);
            });

        const totalDuration = formatDuration(Date.now() - eventData.startTime);

        let winnerDescription = `Event Duration: **${totalDuration}**\nEvent Ended: <t:${Math.floor(Date.now() / 1000)}:F>\n\n`;
        
        // Add winner
        const winner = sortedParticipants[0];
        const winnerDuration = formatDuration(
            (winner.leaveTime || Date.now()) - winner.joinTime
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

        await channel.send({ embeds: [winnerEmbed] });

        // Clear event data
        const eventsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        delete eventsData[voiceChannelId];
        fs.writeFileSync(dataPath, JSON.stringify(eventsData, null, 2));

    } catch (error) {
        console.error('Error ending event:', error);
    }
}

module.exports = {
    name: 'voiceStateUpdate',
    async execute(client, oldState, newState) {
        try {
            if (!fs.existsSync(dataPath)) return;
            
            const eventsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            
            // Check if user left an active event channel
            if (oldState.channelId && eventsData[oldState.channelId]) {
                const eventData = eventsData[oldState.channelId];
                
                // Only process if event is active and user was a participant
                if (eventData.status === 'active' && eventData.participants[oldState.member.id]) {
                    // Update participant status
                    eventData.participants[oldState.member.id].status = 'left';
                    eventData.participants[oldState.member.id].leaveTime = Date.now();

                    // Count remaining active participants
                    const activeParticipants = Object.values(eventData.participants)
                        .filter(p => p.status === 'active');

                    // Update status embed
                    await updateStatusEmbed(client, eventData);

                    // Check if only one participant remains
                    if (activeParticipants.length === 1) {
                        await endEvent(client, eventData, oldState.channelId);
                    } else {
                        // Save updated event data
                        eventsData[oldState.channelId] = eventData;
                        fs.writeFileSync(dataPath, JSON.stringify(eventsData, null, 2));
                    }
                }
            }
        } catch (error) {
            console.error('Error in voiceStateUpdate:', error);
        }
    }
};
