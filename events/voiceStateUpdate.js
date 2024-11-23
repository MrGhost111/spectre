const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const dataPath = path.join(__dirname, '../data/ltl-events.json');
const LTL_CHANNEL_ID = '944924720158085190';

function formatDuration(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));

    let parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(' ');
}

async function updateStatusEmbed(client, eventData) {
    try {
        const guild = client.guilds.cache.get(eventData.guildId);
        const channel = guild.channels.cache.get(eventData.logChannelId);
        const statusMessage = await channel.messages.fetch(eventData.statusMessageId);

        const activeParticipants = Object.values(eventData.participants).filter(p => p.status === 'active').length;
        const totalParticipants = Object.keys(eventData.participants).length;
        
        let duration = '0s';
        if (eventData.startTime) {
            duration = formatDuration(Date.now() - eventData.startTime);
        }

        const statusEmbed = new EmbedBuilder()
            .setTitle('Last to Leave Status Board')
            .setColor(eventData.status === 'active' ? '#FF0000' : '#00FF00')
            .setTimestamp()
            .addFields(
                { name: 'Event Duration', value: duration, inline: true },
                { name: 'Participants Remaining', value: `${activeParticipants}/${totalParticipants}`, inline: true }
            );

        // Sort participants by status (active first) and then by leave time
        const sortedParticipants = Object.values(eventData.participants)
            .sort((a, b) => {
                if (a.status === b.status) {
                    return (b.leaveTime || Date.now()) - (a.leaveTime || Date.now());
                }
                return a.status === 'active' ? -1 : 1;
            });

        let participantsList = '';
        sortedParticipants.forEach(participant => {
            const status = participant.status === 'active' ? '✅' : '❌';
            const timeLastedMs = participant.leaveTime 
                ? participant.leaveTime - eventData.startTime
                : Date.now() - eventData.startTime;
            const timeLasted = formatDuration(timeLastedMs);
            const rank = participant.rank ? `#${participant.rank}` : 'Active';
            participantsList += `${status} ${participant.username} | ${rank} | ${timeLasted}\n`;
        });

        statusEmbed.addFields({ 
            name: 'Participants Status', 
            value: participantsList || 'No participants yet'
        });

        await statusMessage.edit({ embeds: [statusEmbed] });
    } catch (error) {
        console.error('Error updating status embed:', error);
    }
}

module.exports = {
    name: 'voiceStateUpdate',
    async execute(client, oldState, newState) {
        if (!fs.existsSync(dataPath)) return;

        try {
            const eventsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            const event = eventsData[LTL_CHANNEL_ID];
            
            if (!event || event.status !== 'active') return;

            const isJoining = !oldState.channelId && newState.channelId === LTL_CHANNEL_ID;
            const isLeaving = oldState.channelId === LTL_CHANNEL_ID && newState.channelId !== LTL_CHANNEL_ID;
            
            if (!isJoining && !isLeaving) return;

            if (isLeaving && event.participants[oldState.member.id]?.status === 'active') {
                // Handle participant leaving
                const activeParticipants = Object.values(event.participants)
                    .filter(p => p.status === 'active').length;
                
                event.participants[oldState.member.id].status = 'left';
                event.participants[oldState.member.id].leaveTime = Date.now();
                event.participants[oldState.member.id].rank = activeParticipants;

                // Check if we have a winner
                if (activeParticipants === 2) { // This person leaving makes it 1
                    const winner = Object.entries(event.participants)
                        .find(([_, p]) => p.status === 'active');
                    
                    if (winner) {
                        const [winnerId, winnerData] = winner;
                        winnerData.rank = 1;
                        
                        // Create winner announcement embed
                        const winnerEmbed = new EmbedBuilder()
                            .setTitle('🎉 Last to Leave Event Completed! 🎉')
                            .setColor('#FFD700')
                            .setDescription(`Congratulations to **${winnerData.username}** for winning the Last to Leave event!`)
                            .addFields(
                                { name: 'Duration', value: formatDuration(Date.now() - event.startTime), inline: true },
                                { name: 'Total Participants', value: String(Object.keys(event.participants).length), inline: true }
                            );

                        const channel = await client.channels.fetch(event.logChannelId);
                        await channel.send({ embeds: [winnerEmbed] });
                        
                        event.status = 'completed';
                    }
                }

                // Update status embed
                await updateStatusEmbed(client, event);
                
                // Save updated event data
                eventsData[LTL_CHANNEL_ID] = event;
                fs.writeFileSync(dataPath, JSON.stringify(eventsData, null, 2));
            }
        } catch (error) {
            console.error('Error in voiceStateUpdate event:', error);
        }
    }
};
