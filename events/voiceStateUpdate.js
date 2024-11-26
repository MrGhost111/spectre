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
            .setTitle('🎮 Last to Leave Event - Active')
            .setDescription(`Event Started: <t:${Math.floor(eventData.startTime / 1000)}:F>`)
            .setColor('#FF0000')
            .setTimestamp()
            .addFields(
                { name: '⏱️ Event Duration', value: duration, inline: true },
                { name: '👥 Participants Remaining', value: `${activeParticipants.length}/${totalParticipants}`, inline: true }
            );

        let participantsList = '';
        Object.values(eventData.participants).forEach(participant => {
            const status = participant.status === 'active' ? '✅' : '❌';
            const timeSpent = participant.leaveTime ? 
                `(${formatDuration(participant.leaveTime - participant.joinTime)})` : 
                '(Still Active)';
            participantsList += `${status} ${participant.username} ${timeSpent}\n`;
        });

        statusEmbed.addFields({ 
            name: '📊 Participants Status', 
            value: participantsList || 'No participants'
        });

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

        const winnerEmbed = new EmbedBuilder()
            .setTitle('🎉 Last to Leave Event - Winner Announced! 🎉')
            .setDescription(`Event Duration: ${totalDuration}\nEvent Ended: <t:${Math.floor(Date.now() / 1000)}:F>`)
            .setColor('#FFD700')
            .setTimestamp();

        // Add winner
        const winner = sortedParticipants[0];
        const winnerDuration = formatDuration(
            (winner.leaveTime || Date.now()) - winner.joinTime
        );
        winnerEmbed.addFields({
            name: '🥇 Winner',
            value: `${winner.username}\nTime: ${winnerDuration}`,
            inline: false
        });

        if (sortedParticipants.length > 1) {
            const second = sortedParticipants[1];
            const secondDuration = formatDuration(second.leaveTime - second.joinTime);
            winnerEmbed.addFields({
                name: '🥈 Second Place',
                value: `${second.username}\nTime: ${secondDuration}`,
                inline: false
            });
        }

        if (sortedParticipants.length > 2) {
            const third = sortedParticipants[2];
            const thirdDuration = formatDuration(third.leaveTime - third.joinTime);
            winnerEmbed.addFields({
                name: '🥉 Third Place',
                value: `${third.username}\nTime: ${thirdDuration}`,
                inline: false
            });
        }

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
