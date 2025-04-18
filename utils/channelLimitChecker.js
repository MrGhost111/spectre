const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dataPath = './data/channels.json';

/**
 * Check channels for members exceeding limits and verify channel owners still have required roles
 * @param {Client} client - Discord.js client
 * @returns {Promise<boolean>} - Success status of the operation
 */
async function checkChannelLimits(client) {
    console.log('Starting channel limit check at:', new Date().toISOString());

    // Define the role limits and required roles
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

    // Required roles to own a channel (same as in myc.js)
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

    // Track changes for reporting
    const removedChannels = [];
    const channelFriendRemovals = {}; // Group removed friends by channel

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

        // Fetch the discord channel
        let discordChannel;
        try {
            discordChannel = await client.channels.fetch(channelData.channelId);
            if (!discordChannel) {
                console.log(`Channel ${channelData.channelId} not found`);
                continue;
            }
        } catch (error) {
            console.log(`Error fetching channel ${channelData.channelId}:`, error);
            continue;
        }

        // Check if member still has one of the required roles
        const hasRequiredRole = member.roles.cache.some(role => requiredRoles.includes(role.id));

        if (!hasRequiredRole) {
            console.log(`User ${userId} no longer has any required roles for channel ownership`);

            try {
                // Remove all permission overwrites for friends
                for (const friendId of channelData.friends) {
                    try {
                        await discordChannel.permissionOverwrites.delete(friendId);
                        console.log(`Removed permission for ${friendId} from channel ${channelData.channelId}`);
                    } catch (error) {
                        console.error(`Error removing permission for ${friendId}:`, error);
                    }
                }

                // Remove owner's permission as well
                try {
                    await discordChannel.permissionOverwrites.delete(userId);
                    console.log(`Removed permission for owner ${userId} from channel ${channelData.channelId}`);
                } catch (error) {
                    console.error(`Error removing permission for owner ${userId}:`, error);
                }

                // Add to removed channels list
                removedChannels.push({
                    userId,
                    channelId: channelData.channelId,
                    friendCount: channelData.friends.length
                });

                // Remove this channel from the data
                delete channels[userId];

            } catch (error) {
                console.error(`Error processing channel ${channelData.channelId} for role removal:`, error);
            }
        } else {
            // User has required role, now check friend limits

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
                    // Calculate how many friends need to be removed
                    const excessCount = currentFriendsCount - maxAllowedFriends;
                    const friendsToRemove = channelData.friends.slice(-excessCount);

                    // Initialize the channel entry in our tracking object if it doesn't exist
                    if (!channelFriendRemovals[channelData.channelId]) {
                        channelFriendRemovals[channelData.channelId] = {
                            userId,
                            channelId: channelData.channelId,
                            originalCount: currentFriendsCount,
                            newCount: maxAllowedFriends,
                            removedFriends: []
                        };
                    }

                    // Remove excess friends from the channel permissions and data
                    for (const friendId of friendsToRemove) {
                        // Remove from channel permissions
                        try {
                            await discordChannel.permissionOverwrites.delete(friendId);
                            console.log(`Removed permission for ${friendId} from channel ${channelData.channelId}`);

                            // Add to our tracking for this channel
                            channelFriendRemovals[channelData.channelId].removedFriends.push(friendId);

                        } catch (error) {
                            console.error(`Error removing permission for ${friendId}:`, error);
                        }
                    }

                    // Update the data by removing the excess friends
                    channelData.friends = channelData.friends.slice(0, maxAllowedFriends);

                } catch (error) {
                    console.error(`Error processing channel ${channelData.channelId} for excess friends:`, error);
                }
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
    const embed = new EmbedBuilder()
        .setTitle('Channel Access Check Report')
        .setColor(0x6666ff)
        .setTimestamp();

    // Add summary information
    let description = [];
    const modifiedChannelsCount = Object.keys(channelFriendRemovals).length;

    if (removedChannels.length > 0) {
        description.push(`**${removedChannels.length} channels** were fully revoked due to owners lacking required roles.`);
    }

    if (modifiedChannelsCount > 0) {
        const totalRemovedFriends = Object.values(channelFriendRemovals).reduce((total, channel) =>
            total + channel.removedFriends.length, 0);
        description.push(`**${modifiedChannelsCount} channels** had a total of **${totalRemovedFriends} friends** removed due to exceeding allowed limits.`);
    }

    if (removedChannels.length === 0 && modifiedChannelsCount === 0) {
        description.push('No issues found. All channel owners have required roles and are within friend limits.');
    }

    embed.setDescription(description.join('\n'));

    // Add fields for removed channels (up to 10 to avoid hitting embed limits)
    if (removedChannels.length > 0) {
        embed.addFields({
            name: 'Fully Revoked Channels',
            value: '────────────────────'
        });

        const displayedRemovals = removedChannels.slice(0, 10);
        for (const removal of displayedRemovals) {
            embed.addFields({
                name: `Channel <#${removal.channelId}>`,
                value: `Owner: <@${removal.userId}>\nFriends Removed: ${removal.friendCount}\nReason: Missing required roles`
            });
        }

        if (removedChannels.length > 10) {
            embed.addFields({
                name: 'Additional Revoked Channels',
                value: `${removedChannels.length - 10} more channels not shown.`
            });
        }
    }

    // Add fields for modified channels, grouping friends by channel
    const channelRemovalValues = Object.values(channelFriendRemovals);
    if (channelRemovalValues.length > 0) {
        embed.addFields({
            name: 'Modified Channels',
            value: '────────────────────'
        });

        // Display up to 5 modified channels (with more focus on friend details)
        const displayedModifications = channelRemovalValues.slice(0, 5);
        for (const channelMod of displayedModifications) {
            let fieldValue = `Owner: <@${channelMod.userId}>\n`;
            fieldValue += `Friends: ${channelMod.originalCount} → ${channelMod.newCount}\n`;

            // Add up to 10 removed friends per channel, or summarize if more
            if (channelMod.removedFriends.length <= 10) {
                fieldValue += `Removed Friends:\n`;
                channelMod.removedFriends.forEach(friendId => {
                    fieldValue += `• <@${friendId}>\n`;
                });
            } else {
                fieldValue += `Removed ${channelMod.removedFriends.length} friends (too many to list)`;
            }

            embed.addFields({
                name: `Channel <#${channelMod.channelId}>`,
                value: fieldValue
            });
        }

        if (channelRemovalValues.length > 5) {
            embed.addFields({
                name: 'Additional Modified Channels',
                value: `${channelRemovalValues.length - 5} more channels had friends removed (not shown here).`
            });
        }
    }

    await reportChannel.send({ embeds: [embed] });

    console.log('Channel limit check completed at:', new Date().toISOString());
    return true;
}

module.exports = { checkChannelLimits };
