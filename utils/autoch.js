const fs = require('fs');
const path = require('path');
const dataPath = './data/channels.json';

/**
 * Checks if a member has any of the required roles to own a channel
 * @param {Object} member - Discord guild member object
 * @param {Array} requiredRoles - Array of role IDs required to own a channel
 * @returns {Boolean} Whether the member has any of the required roles
 */
function hasRequiredRole(member, requiredRoles) {
    return member.roles.cache.some(role => requiredRoles.includes(role.id));
}

/**
 * Calculates the maximum number of friends a member can have in their channel
 * @param {Object} member - Discord guild member object
 * @returns {Number} Maximum number of friends allowed
 */
function calculateMaxFriends(member) {
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

    let maxFriends = 0;

    for (const [roleId, limit] of Object.entries(roleLimits)) {
        if (member.roles.cache.has(roleId)) {
            maxFriends += limit;
        }
    }

    return maxFriends;
}

/**
 * Performs weekly channel eligibility checks and adjustments
 * @param {Client} client - Discord client instance
 * @param {string|null} logChannelId - Channel ID to log results (optional)
 * @returns {Promise<Object>} Results of the channel check operation
 */
async function weeklyChannelCheck(client, logChannelId = null) {
    console.log('Starting weekly channel eligibility check...');

    // Results to track what happened during the check
    const results = {
        channelsChecked: 0,
        ownersWithoutRoles: 0,
        channelsWithExcessFriends: 0,
        friendsRemoved: 0,
        errors: [],
        removedFriendsDetails: [] // Store detailed information about removed friends
    };

    // Get logging channel if provided
    let logChannel = null;
    if (logChannelId) {
        try {
            logChannel = await client.channels.fetch(logChannelId);
            await logChannel.send('🔍 Starting weekly channel eligibility check...');
        } catch (error) {
            console.error(`Failed to fetch log channel ${logChannelId}:`, error);
        }
    }

    try {
        // Read channels data
        const data = fs.readFileSync(dataPath, 'utf8');
        const channels = JSON.parse(data);

        // Skip the empty channels array if it exists
        if (channels.channels && Array.isArray(channels.channels)) {
            delete channels.channels;
        }

        // Get the main guild
        const mainGuild = client.guilds.cache.first(); // Assuming the bot is in only one guild
        if (!mainGuild) {
            throw new Error('Could not find the guild');
        }

        // Define required roles
        const requiredRoles = [
            '768448955804811274',
            '768449168297033769',
            '946729964328337408',
            '1028256286560763984',
            '1028256279124250624',
            '1038106794200932512',
            '1038888209440067604',
            '783032959350734868'
        ];

        // Process each channel
        const channelEntries = Object.entries(channels);
        for (const [userId, channelData] of channelEntries) {
            // Skip non-object entries or the "channels" array
            if (!channelData || typeof channelData !== 'object' || !channelData.userId || !channelData.channelId) {
                continue;
            }

            results.channelsChecked++;

            try {
                // Fetch the channel owner
                const member = await mainGuild.members.fetch(userId).catch(() => null);

                // If member not found or has no required roles, log but don't take action yet
                if (!member || !hasRequiredRole(member, requiredRoles)) {
                    console.log(`Owner ${userId} for channel ${channelData.channelId} doesn't have required roles`);
                    results.ownersWithoutRoles++;
                    continue; // Future implementation could remove or reassign the channel
                }

                // Calculate max friends allowed
                const maxFriends = calculateMaxFriends(member);

                // Check if there are too many friends
                if (channelData.friends && channelData.friends.length > maxFriends) {
                    results.channelsWithExcessFriends++;
                    console.log(`Channel ${channelData.channelId} has ${channelData.friends.length} friends but max is ${maxFriends}`);

                    // Calculate how many friends need to be removed
                    const excessCount = channelData.friends.length - maxFriends;

                    // Remove excess friends (from the end of the array, as these are the most recently added)
                    const removedFriends = channelData.friends.splice(maxFriends, excessCount);
                    results.friendsRemoved += removedFriends.length;

                    // Log the removed friends
                    console.log(`Removed ${removedFriends.length} friends from channel ${channelData.channelId}: ${removedFriends.join(', ')}`);

                    // Store details for later reporting
                    results.removedFriendsDetails.push({
                        channelId: channelData.channelId,
                        ownerId: userId,
                        removedCount: removedFriends.length,
                        removedFriends: removedFriends
                    });

                    // Try to fetch the channel to send a notification
                    const channel = await client.channels.fetch(channelData.channelId).catch(() => null);
                    if (channel) {
                        const removedMentions = removedFriends.map(id => `<@${id}>`).join(', ');
                        await channel.send(`Due to weekly role adjustments, the following friends have been removed from this channel: ${removedMentions}`).catch(err => {
                            console.error(`Failed to send notification in channel ${channelData.channelId}:`, err);
                        });
                    }
                }
            } catch (error) {
                console.error(`Error processing channel ${channelData.channelId}:`, error);
                results.errors.push(`Channel ${channelData.channelId}: ${error.message}`);
            }
        }

        // Save updated channels data
        fs.writeFileSync(dataPath, JSON.stringify(channels, null, 2), 'utf8');
        console.log('Channels data updated successfully');

    } catch (error) {
        console.error('Error during weekly channel check:', error);
        results.errors.push(`General error: ${error.message}`);
    }

    console.log('Weekly channel eligibility check completed with results:', results);

    // Log results to the channel if provided
    if (logChannel) {
        try {
            // Format the results for Discord
            const timestamp = new Date().toISOString();
            let resultMessage = `## Channel Eligibility Check Results (${timestamp})\n`;
            resultMessage += `- **Channels Checked:** ${results.channelsChecked}\n`;
            resultMessage += `- **Owners Without Required Roles:** ${results.ownersWithoutRoles}\n`;
            resultMessage += `- **Channels With Excess Friends:** ${results.channelsWithExcessFriends}\n`;
            resultMessage += `- **Total Friends Removed:** ${results.friendsRemoved}\n`;

            // Add details about removed friends if any
            if (results.removedFriendsDetails.length > 0) {
                resultMessage += `\n### Details of Removed Friends:\n`;
                for (const detail of results.removedFriendsDetails) {
                    resultMessage += `- Channel <#${detail.channelId}> (Owner: <@${detail.ownerId}>): Removed ${detail.removedCount} friends\n`;
                    // List the removed friends if there aren't too many
                    if (detail.removedFriends.length <= 10) {
                        const removedMentions = detail.removedFriends.map(id => `<@${id}>`).join(', ');
                        resultMessage += `  - Removed: ${removedMentions}\n`;
                    }
                }
            }

            // Add errors if any
            if (results.errors.length > 0) {
                resultMessage += `\n### Errors:\n`;
                resultMessage += results.errors.map(err => `- ${err}`).join('\n');
            }

            // Send the results
            await logChannel.send(resultMessage);
        } catch (error) {
            console.error('Failed to send results to log channel:', error);
        }
    }

    return results;
}

module.exports = { weeklyChannelCheck };