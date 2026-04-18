const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
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
    const ROLE_CONFIG = {
        '768448955804811274': { limit: 5 },
        '768449168297033769': { limit: 5 },
        '946729964328337408': { limit: 5 },
        '1028256286560763984': { limit: 5 },
        '1028256279124250624': { limit: 5 },
        '1038106794200932512': { limit: 5 },
        '783032959350734868': { limit: 10 },
        '1038888209440067604': { limit: 5, requiresRole: '783032959350734868' },
        '1349716423706148894': { limit: 5 },
    };

    let total = 0;
    for (const [roleId, config] of Object.entries(ROLE_CONFIG)) {
        if (member.roles.cache.has(roleId)) {
            if (config.requiresRole) {
                if (member.roles.cache.has(config.requiresRole)) total += config.limit;
            } else {
                total += config.limit;
            }
        }
    }
    return total;
}

/**
 * Checks if a channel is already archived (in the archive category)
 * @param {Object} channel - Discord channel object
 * @returns {Boolean} Whether the channel is already archived
 */
async function isChannelArchived(channel) {
    if (!channel || !channel.parentId) return false;

    // Archive category ID
    const archiveCategoryId = '1273361676355244102';

    return channel.parentId === archiveCategoryId;
}

/**
 * Removes all user permissions from a channel except for the owner
 * @param {Object} channel - Discord channel object
 * @param {String} ownerId - ID of the channel owner
 */
async function removeAllUsersFromChannel(channel, ownerId) {
    try {
        // Get all permission overwrites
        const permissions = channel.permissionOverwrites.cache;

        // Loop through all permission overwrites
        for (const [id, overwrite] of permissions) {
            // Skip the owner, @everyone role, and non-user overwrites
            if (id === ownerId || id === channel.guild.id) continue;

            // Get the overwrite type (role or member)
            const type = overwrite.type;

            // Only remove user permissions, not role permissions
            if (type === 1) { // 1 is for member overwrites
                await channel.permissionOverwrites.delete(id).catch(() => { });
            }
        }
    } catch (error) {
        console.error(`Error removing users from channel ${channel.id}:`, error);
    }
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
        ownersLeftServer: 0,
        channelsWithExcessFriends: 0,
        channelsArchived: 0,
        friendsRemoved: 0,
        channelsAlreadyArchived: 0,
        errors: [],
        removedFriendsDetails: [], // Store detailed information about removed friends
        ownersWithoutRolesDetails: [], // Store details about owners without roles
        ownersLeftServerDetails: [], // Store details about owners who left
        archivedChannelsDetails: [] // Store details about archived channels
    };

    // Get logging channel if provided
    let logChannel = null;
    if (logChannelId) {
        try {
            logChannel = await client.channels.fetch(logChannelId);
        } catch (error) {
            console.error(`Failed to fetch log channel ${logChannelId}:`, error);
        }
    }

    try {
        // Read channels data
        let channels = {};
        try {
            const data = fs.readFileSync(dataPath, 'utf8');
            channels = JSON.parse(data);

            // Skip the empty channels array if it exists
            if (channels.channels && Array.isArray(channels.channels)) {
                delete channels.channels;
            }
        } catch (error) {
            console.error('Error reading channels data:', error);
            results.errors.push(`Failed to read channels data: ${error.message}`);
            return results;
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
            '783032959350734868',
            '1349716423706148894',
        ];

        // Process each channel
        const channelEntries = Object.entries(channels);
        for (const [userId, channelData] of channelEntries) {
            // Skip non-object entries or the "channels" array
            if (!channelData || typeof channelData !== 'object' || !channelData.userId || !channelData.channelId) {
                continue;
            }

            try {
                // Fetch the channel first to check if it's already archived
                const channel = await client.channels.fetch(channelData.channelId).catch(() => null);

                // If channel doesn't exist, skip it
                if (!channel) {
                    console.log(`Channel ${channelData.channelId} doesn't exist, skipping`);
                    continue;
                }

                // Check if channel is already in archive category
                const archived = await isChannelArchived(channel);
                if (archived) {
                    console.log(`Channel ${channelData.channelId} is already archived, skipping`);
                    results.channelsAlreadyArchived++;
                    continue;
                }

                // Now we count the channel as checked since we're processing it
                results.channelsChecked++;

                // Fetch the channel owner
                const member = await mainGuild.members.fetch(userId).catch(() => null);

                // Check if member left the server or lost required roles
                if (!member) {
                    console.log(`Owner ${userId} for channel ${channelData.channelId} has left the server`);
                    results.ownersLeftServer++;
                    results.ownersLeftServerDetails.push({
                        userId: userId,
                        channelId: channelData.channelId
                    });

                    // Archive the channel
                    if (channel) {
                        try {
                            // Get the archive category
                            const archiveCategory = await client.channels.fetch('1273361676355244102').catch(() => null);
                            if (archiveCategory) {
                                // Remove all user permissions from the channel first
                                await removeAllUsersFromChannel(channel, userId);

                                // Archive the channel by moving to archive category
                                await channel.setParent(archiveCategory.id, { lockPermissions: false });

                                // Add a message in the channel
                                await channel.send(`This channel has been archived because the owner has left the server.`);

                                // Track archived channel
                                results.channelsArchived++;
                                results.archivedChannelsDetails.push({
                                    channelId: channelData.channelId,
                                    reason: "Owner left server",
                                    ownerId: userId
                                });
                            }
                        } catch (error) {
                            console.error(`Error archiving channel ${channelData.channelId}:`, error);
                            results.errors.push(`Failed to archive channel ${channelData.channelId}: ${error.message}`);
                        }
                    }

                    continue;
                }

                // Check if member has required roles
                if (!hasRequiredRole(member, requiredRoles)) {
                    console.log(`Owner ${userId} for channel ${channelData.channelId} doesn't have required roles`);
                    results.ownersWithoutRoles++;
                    results.ownersWithoutRolesDetails.push({
                        userId: userId,
                        channelId: channelData.channelId,
                        mention: `<@${userId}>`,
                        channelMention: `<#${channelData.channelId}>`
                    });

                    // Archive the channel
                    if (channel) {
                        try {
                            // Get the archive category
                            const archiveCategory = await client.channels.fetch('1273361676355244102').catch(() => null);
                            if (archiveCategory) {
                                // Remove all user permissions from the channel first
                                await removeAllUsersFromChannel(channel, userId);

                                // Archive the channel by moving to archive category
                                await channel.setParent(archiveCategory.id, { lockPermissions: false });

                                // Add a message in the channel
                                await channel.send(`This channel has been archived because the owner no longer has the required roles.`);

                                // Track archived channel
                                results.channelsArchived++;
                                results.archivedChannelsDetails.push({
                                    channelId: channelData.channelId,
                                    reason: "Owner lost required roles",
                                    ownerId: userId
                                });
                            }
                        } catch (error) {
                            console.error(`Error archiving channel ${channelData.channelId}:`, error);
                            results.errors.push(`Failed to archive channel ${channelData.channelId}: ${error.message}`);
                        }
                    }

                    continue;
                }

                // Calculate max friends allowed
                const maxFriends = calculateMaxFriends(member);

                // Check if there are too many friends
                if (channelData.friends && Array.isArray(channelData.friends) && channelData.friends.length > maxFriends) {
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
                        channelMention: `<#${channelData.channelId}>`,
                        ownerId: userId,
                        ownerMention: `<@${userId}>`,
                        removedCount: removedFriends.length,
                        removedFriends: removedFriends,
                        removedMentions: removedFriends.map(id => `<@${id}>`)
                    });

                    // Try to update permissions in the channel
                    if (channel) {
                        // Remove permissions for each removed friend
                        for (const friendId of removedFriends) {
                            await channel.permissionOverwrites.delete(friendId).catch(() => { });
                        }

                        // Send notification
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
        try {
            fs.writeFileSync(dataPath, JSON.stringify(channels, null, 2), 'utf8');
            console.log('Channels data updated successfully');
        } catch (error) {
            console.error('Error saving channels data:', error);
            results.errors.push(`Failed to save channels data: ${error.message}`);
        }

    } catch (error) {
        console.error('Error during weekly channel check:', error);
        results.errors.push(`General error: ${error.message}`);
    }

    console.log('Weekly channel eligibility check completed with results:', results);

    // Log results to the channel if provided
    if (logChannel) {
        try {
            const timestamp = new Date().toISOString();

            // Main results embed
            const resultsEmbed = new EmbedBuilder()
                .setTitle('Channel Eligibility Check Results')
                .setDescription(`Check completed at <t:${Math.floor(Date.now() / 1000)}:F>`)
                .setColor(0x6666ff)
                .addFields(
                    { name: 'Channels Checked', value: results.channelsChecked.toString(), inline: true },
                    { name: 'Channels Archived', value: results.channelsArchived.toString(), inline: true },
                    { name: 'Already Archived', value: results.channelsAlreadyArchived.toString(), inline: true },
                    { name: 'Owners Without Roles', value: results.ownersWithoutRoles.toString(), inline: true },
                    { name: 'Owners Left Server', value: results.ownersLeftServer.toString(), inline: true },
                    { name: 'Channels With Excess Friends', value: results.channelsWithExcessFriends.toString(), inline: true },
                    { name: 'Total Friends Removed', value: results.friendsRemoved.toString(), inline: true }
                )
                .setFooter({ text: 'Weekly Channel Check' })
                .setTimestamp();

            // Send the main results
            await logChannel.send({ embeds: [resultsEmbed] });

            // If owners left server, create an embed for them
            if (results.ownersLeftServerDetails.length > 0) {
                const leftServerEmbed = new EmbedBuilder()
                    .setTitle('Owners Who Left Server')
                    .setColor(0xff5555)
                    .setDescription(
                        results.ownersLeftServerDetails.map(detail =>
                            `• Owner ID: \`${detail.userId}\` - Channel: <#${detail.channelId}>`
                        ).join('\n').substring(0, 4000)
                    );

                await logChannel.send({ embeds: [leftServerEmbed] });
            }

            // If owners without roles, create an embed for them
            if (results.ownersWithoutRolesDetails.length > 0) {
                const withoutRolesEmbed = new EmbedBuilder()
                    .setTitle('Owners Without Required Roles')
                    .setColor(0xffaa55)
                    .setDescription(
                        results.ownersWithoutRolesDetails.map(detail =>
                            `• Owner: ${detail.mention} - Channel: ${detail.channelMention}`
                        ).join('\n').substring(0, 4000)
                    );

                await logChannel.send({ embeds: [withoutRolesEmbed] });
            }

            // If channels archived, create an embed for them
            if (results.archivedChannelsDetails.length > 0) {
                const archivedEmbed = new EmbedBuilder()
                    .setTitle('Channels Archived')
                    .setColor(0xaa55aa)
                    .setDescription(
                        results.archivedChannelsDetails.map(detail =>
                            `• Channel: <#${detail.channelId}> - Reason: ${detail.reason} - Owner: <@${detail.ownerId}>`
                        ).join('\n').substring(0, 4000)
                    );

                await logChannel.send({ embeds: [archivedEmbed] });
            }

            // If friends removed, create embeds (potentially multiple due to length)
            if (results.removedFriendsDetails.length > 0) {
                const removedFriendsEmbed = new EmbedBuilder()
                    .setTitle('Friends Removed from Channels')
                    .setColor(0x55aaff);

                // Build description with mentions
                let description = '';
                for (const detail of results.removedFriendsDetails) {
                    const channelEntry = `• Channel: ${detail.channelMention} - Owner: ${detail.ownerMention}\n`;
                    const friendsList = detail.removedMentions.length <= 10
                        ? `  Removed: ${detail.removedMentions.join(', ')}\n\n`
                        : `  Removed: ${detail.removedCount} friends\n\n`;

                    // Check if adding this entry would exceed Discord's limit
                    if ((description + channelEntry + friendsList).length > 4000) {
                        // If so, send current embed and start a new one
                        removedFriendsEmbed.setDescription(description);
                        await logChannel.send({ embeds: [removedFriendsEmbed] });

                        // Reset for next embed
                        description = channelEntry + friendsList;
                    } else {
                        description += channelEntry + friendsList;
                    }
                }

                // Send final embed if there's any description left
                if (description) {
                    removedFriendsEmbed.setDescription(description);
                    await logChannel.send({ embeds: [removedFriendsEmbed] });
                }
            }

            // If errors, create an embed for them
            if (results.errors.length > 0) {
                const errorsEmbed = new EmbedBuilder()
                    .setTitle('Errors During Check')
                    .setColor(0xff0000)
                    .setDescription(
                        results.errors.map(err => `• ${err}`).join('\n').substring(0, 4000)
                    );

                await logChannel.send({ embeds: [errorsEmbed] });
            }
        } catch (error) {
            console.error('Failed to send results to log channel:', error);
        }
    }

    return results;
}

module.exports = { weeklyChannelCheck };