const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const dataPath = path.join(__dirname, '../data/ltl-events.json');

// Discord embed limits
const MAX_FIELD_VALUE_LENGTH = 1024;
const MAX_FIELDS_PER_EMBED = 25;
const MAX_EMBEDS = 10;

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

async function createStatusEmbed(eventData) {
    const activeParticipants = Object.values(eventData.participants || {}).filter(p => p.status === 'active');
    const totalParticipants = Object.keys(eventData.participants || {}).length;
    const duration = eventData.startTime ? formatDuration(Date.now() - eventData.startTime) : '0s';
    const currentTimestamp = Math.floor(Date.now() / 1000);

    const sortedParticipants = Object.values(eventData.participants || {})
        .sort((a, b) => {
            if (a.status === 'active' && b.status === 'active') return 0;
            if (a.status === 'active') return -1;
            if (b.status === 'active') return 1;
            return (b.leaveTime || Date.now()) - (a.leaveTime || Date.now());
        });

    // If waiting status, return single embed
    if (eventData.status === 'waiting') {
        const embed = new EmbedBuilder()
            .setTitle('<:YJ_streak:1259258046924853421> Last to Leave Event - Waiting to Start')
            .setColor('#6666ff')
            .setDescription('Event Setup Complete!\nThe voice channel is now unlocked and ready for participants.\nThe event will begin when the host uses ,start')
            .setTimestamp();
        return { embed: [embed] };
    }

    // Create embeds array
    const embeds = [];

    // Main embed with event info
    const mainEmbed = new EmbedBuilder()
        .setTitle('<:power:1064835342160625784> Last to Leave Event - Active')
        .setColor('#FF0000')
        .setTimestamp();

    let description = `Event Started: <t:${Math.floor(eventData.startTime / 1000)}:F>\n`;
    description += `<:time:1000024854478721125> Event Duration: ${duration}\n`;
    description += `<:user:1273754877646082048> Participants Remaining: ${activeParticipants.length}/${totalParticipants}\n`;
    description += `Last Updated: <t:${currentTimestamp}:R>\n\n`;
    description += '<:user:1273754877646082048> Participants Status:';
    mainEmbed.setDescription(description);

    embeds.push(mainEmbed);

    // Build participant list
    let currentFieldValue = '';
    let fieldCount = 0;
    let embedIndex = 0;

    for (let i = 0; i < sortedParticipants.length; i++) {
        const participant = sortedParticipants[i];
        const status = participant.status === 'active' ? '<a:tick:1276746433495830620>' : '<a:crossmark:1276746067026903061>';
        const timeSpent = participant.status === 'active' ?
            `(${formatDuration(Date.now() - participant.joinTime, true)})` :
            `(${formatDuration(participant.leaveTime - participant.joinTime)})`;
        const line = `${status} ${participant.username} ${timeSpent}\n`;

        // Check if adding this line would exceed field value limit
        if ((currentFieldValue + line).length > MAX_FIELD_VALUE_LENGTH) {
            // Add current field to current embed
            if (fieldCount < MAX_FIELDS_PER_EMBED) {
                embeds[embedIndex].addFields({
                    name: fieldCount === 0 ? '\u200b' : 'Continued...',
                    value: currentFieldValue || '\u200b'
                });
                fieldCount++;
                currentFieldValue = line;
            } else {
                // Current embed is full, create new embed
                if (embedIndex < MAX_EMBEDS - 1) {
                    embedIndex++;
                    const continueEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('Participants (continued)');
                    embeds.push(continueEmbed);
                    fieldCount = 0;
                    currentFieldValue = line;
                } else {
                    // Reached max embeds, truncate
                    currentFieldValue += `\n... and ${sortedParticipants.length - i} more participants`;
                    break;
                }
            }
        } else {
            currentFieldValue += line;
        }
    }

    // Add remaining field value
    if (currentFieldValue) {
        embeds[embedIndex].addFields({
            name: fieldCount === 0 ? '\u200b' : 'Continued...',
            value: currentFieldValue
        });
    }

    return { embed: embeds };
}

async function updateStatusMessage(client, eventData) {
    try {
        const channel = await client.channels.fetch(eventData.logChannelId);
        const statusMessage = await channel.messages.fetch(eventData.statusMessageId);
        const { embed } = await createStatusEmbed(eventData);
        const embeds = Array.isArray(embed) ? embed : [embed];
        await statusMessage.edit({ embeds: embeds });
        console.log(`[${new Date().toISOString()}] Status message updated successfully`);
    } catch (error) {
        console.error('Error updating status message:', error);
    }
}

async function announcePlace(client, eventData, participant, place) {
    try {
        const channel = await client.channels.fetch(eventData.logChannelId);
        const duration = formatDuration(participant.leaveTime - participant.joinTime);
        const placeEmojis = {
            3: '<a:three_:1311075241283424380>',
            2: '<a:two_:1311075222312718346>',
            1: '<a:one_:1311073131905024040>'
        };
        const placeName = {
            3: 'Third',
            2: 'Second',
            1: 'First'
        };

        const placeEmbed = new EmbedBuilder()
            .setTitle(`${placeEmojis[place]} ${placeName[place]} Place Announcement`)
            .setDescription(`**${participant.username}** has secured ${placeName[place]} Place!\nTime Lasted: **${duration}**`)
            .setColor(place === 1 ? '#FFD700' : place === 2 ? '#C0C0C0' : '#CD7F32')
            .setTimestamp();

        await channel.send({ embeds: [placeEmbed] });
    } catch (error) {
        console.error('Error announcing place:', error);
    }
}

async function announceWinner(client, eventData) {
    try {
        const channel = await client.channels.fetch(eventData.logChannelId);
        const sortedParticipants = Object.values(eventData.participants)
            .sort((a, b) => {
                const aTime = a.leaveTime || Date.now();
                const bTime = b.leaveTime || Date.now();
                return (bTime - b.joinTime) - (aTime - a.joinTime);
            });

        const totalDuration = formatDuration(Date.now() - eventData.startTime);
        let winnerDescription = `Event Duration: **${totalDuration}**\nEvent Status: Completed\n\n`;

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

        // Save the updated event data with winner message ID
        const eventsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        const channelId = Object.keys(eventsData).find(key => eventsData[key] === eventData);
        if (channelId) {
            eventsData[channelId] = eventData;
            fs.writeFileSync(dataPath, JSON.stringify(eventsData, null, 2));
        }

        return winnerMessage.id;
    } catch (error) {
        console.error('Error announcing winner:', error);
    }
}

// Set up automatic status updates
const updateIntervals = new Map();

function startStatusUpdates(client, channelId, eventData) {
    if (updateIntervals.has(channelId)) {
        clearInterval(updateIntervals.get(channelId));
    }

    // Perform initial update
    updateStatusMessage(client, eventData).catch(console.error);
    console.log(`[${new Date().toISOString()}] Starting status updates for channel ${channelId}`);

    const interval = setInterval(async () => {
        try {
            // Read fresh data each time
            const eventsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            const currentEventData = eventsData[channelId];

            if (currentEventData && currentEventData.status === 'active') {
                await updateStatusMessage(client, currentEventData);
                console.log(`[${new Date().toISOString()}] Status update performed for channel ${channelId}`);
            } else {
                console.log(`[${new Date().toISOString()}] Stopping updates for channel ${channelId} - event not active`);
                stopStatusUpdates(channelId);
            }
        } catch (error) {
            console.error('Error in status update interval:', error);
        }
    }, 60000); // Every minute

    updateIntervals.set(channelId, interval);
}

function stopStatusUpdates(channelId) {
    if (updateIntervals.has(channelId)) {
        clearInterval(updateIntervals.get(channelId));
        updateIntervals.delete(channelId);
        console.log(`[${new Date().toISOString()}] Stopped status updates for channel ${channelId}`);
    }
}

module.exports = {
    formatDuration,
    createStatusEmbed,
    updateStatusMessage,
    announcePlace,
    announceWinner,
    startStatusUpdates,
    stopStatusUpdates
};