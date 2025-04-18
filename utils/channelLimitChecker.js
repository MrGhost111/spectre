const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dataPath = './data/channels.json';

/**
 * Check all channels for members exceeding the allowed limit based on owner's roles
 * @param {Client} client - Discord.js client
 * @returns {Promise<boolean>} - Success status of the operation
 */
async function checkChannelLimits(client) {
    console.log('Starting channel limit check at:', new Date().toISOString());

    // Define the role limits
    const roleLimits = {
        '768448955804811274': 5,
        '768449168297033769': 5,
        '946729964328337408': 5,
        '1028256286560763984': 5,
        '1028256279124250624': 5,
        '1038106794200932512': 5,
        '1038888209440067604': 5,
        '783032959350734868': 10,
    };

    // Channel ID to send reports to
    const reportChannelId = '843413781409169412';
    let reportChannel;

    try {
        reportChannel = await client.channels.fetch(reportChannelId);
        if (!reportChannel) {
            console.error('Report channel not found');
            return false;
        }
    } catch (error) {
        console.error('Error fetching report channel:', error);
        return false;
    }

    // Read the channels data
    let channels;
    try {
        const data = fs.readFileSync(dataPath, 'utf8');
        channels = JSON.parse(data);

        if (typeof channels !== 'object' || channels === null) {
            throw new Error('Channels data is not an object');
        }
    } catch (error) {
        console.error('Error reading channels data:', error);
        await reportChannel.send('There was an error reading the channels data during channel limit check.');
        return false;
    }

    // The guild where we're checking members
    const guild = client.guilds.cache.first();
    if (!guild) {
        console.error('Guild not found');
        await reportChannel.send('Guild not found during channel limit check.');
        return false;
    }

    const removedMembers = [];

    // Process each channel
    for (const userId in channels) {
        if (userId === 'channels') continue; // Skip the channels array

        const channelData = channels[userId];
        if (!channelData || !channelData.channelId || !Array.isArray(channelData.friends)) {
            continue;
        }

        // Fetch the member to check their roles
        let member;
        try {
            member = await guild.members.fetch(userId);
            if (!member) {
                console.log(`Member ${userId} not found in guild`);
                continue;
            }
        } catch (error) {
            console.log(`Error fetching member ${userId}:`, error);
            continue;
        }

        // Calculate max allowed friends based on current roles
        let maxAllowedFriends = 0;
        for (const [roleId, limit] of Object.entries(roleLimits)) {
            if (member.roles.cache.has(roleId)) {
                maxAllowedFriends += limit;
            }
        }

        const currentFriendsCount = channelData.friends.length;

        // If friends exceed the limit, we need to remove some
        if (currentFriendsCount > maxAllowedFriends) {
            console.log(`User ${userId} has ${currentFriendsCount} friends but is only allowed ${maxAllowedFriends}`);

            try {
                // Fetch the discord channel
                const discordChannel = await client.channels.fetch(channelData.channelId);

                // Calculate how many friends need to be removed
                const excessCount = currentFriendsCount - maxAllowedFriends;
                const friendsToRemove = channelData.friends.slice(-excessCount);

                // Remove excess friends from the channel permissions and data
                for (const friendId of friendsToRemove) {
                    // Remove from channel permissions
                    if (discordChannel) {
                        try {
                            await discordChannel.permissionOverwrites.delete(friendId);
                            console.log(`Removed permission for ${friendId} from channel ${channelData.channelId}`);
                        } catch (error) {
                            console.error(`Error removing permission for ${friendId}:`, error);
                        }
                    }

                    // Prepare for report
                    removedMembers.push({
                        userId,
                        channelId: channelData.channelId,
                        removedFriendId: friendId
                    });
                }

                // Update the data by removing the excess friends
                channelData.friends = channelData.friends.slice(0, maxAllowedFriends);

            } catch (error) {
                console.error(`Error processing channel ${channelData.channelId}:`, error);
            }
        }
    }

    // Save the updated channels data
    try {
        fs.writeFileSync(dataPath, JSON.stringify(channels, null, 2));
        console.log('Channels data updated successfully');
    } catch (error) {
        console.error('Error writing updated channels data:', error);
        await reportChannel.send('Error saving updated channels data during channel limit check.');
        return false;
    }

    // Send a report to the designated channel
    if (removedMembers.length > 0) {
        const embed = new EmbedBuilder()
            .setTitle('Channel Limit Check Report')
            .setDescription(`Removed ${removedMembers.length} members from channels due to exceeding friend limits.`)
            .setColor(0xFF6347)
            .setTimestamp();

        // Add fields for each removal (up to 25 to avoid hitting embed limits)
        const displayedRemovals = removedMembers.slice(0, 25);
        for (const removal of displayedRemovals) {
            embed.addFields({
                name: `Removal from <#${removal.channelId}>`,
                value: `Owner: <@${removal.userId}>\nRemoved: <@${removal.removedFriendId}>`
            });
        }

        // If there are more removals than we can display
        if (removedMembers.length > 25) {
            embed.addFields({
                name: 'Additional Removals',
                value: `${removedMembers.length - 25} more removals not shown.`
            });
        }

        await reportChannel.send({ embeds: [embed] });
    } else {
        const embed = new EmbedBuilder()
            .setTitle('Channel Limit Check Report')
            .setDescription('No issues found. All channels are within their owner\'s friend limits.')
            .setColor(0x00FF00)
            .setTimestamp();

        await reportChannel.send({ embeds: [embed] });
    }

    console.log('Channel limit check completed at:', new Date().toISOString());
    return true;
}

module.exports = { checkChannelLimits };