const { EmbedBuilder, Colors, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../data/channels.json');

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
 * Checks if a channel is in the archive category
 * @param {Object} channel - Discord channel object
 * @returns {Boolean} Whether the channel is in the archive category
 */
async function isChannelArchived(channel) {
    if (!channel || !channel.parentId) return false;

    // Archive category ID
    const archiveCategoryId = '1273361676355244102';

    return channel.parentId === archiveCategoryId;
}

module.exports = {
    name: 'deadc',
    description: 'Admin command to list channels whose owners are no longer in the server or channels in the archive.',
    async execute(message, args) {
        // Check if the user has admin permissions
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('You cannot use this command.');
        }

        // Send a typing indicator while processing
        await message.channel.sendTyping();

        try {
            // Define required roles (same as in autoch.js)
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

            const channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

            // Arrays to store different types of problematic channels
            const deadChannels = []; // Owners left server
            const missingRoleChannels = []; // Owners missing required roles
            const archivedChannels = []; // Channels already in archive
            const nonExistentChannels = []; // Channels that no longer exist

            // Process each channel
            for (const [userId, channelInfo] of Object.entries(channelsData)) {
                // Skip the 'channels' key if it exists
                if (userId === 'channels') continue;

                // Skip entries with missing channelId or userId
                if (!channelInfo || !channelInfo.channelId || !channelInfo.userId) {
                    continue;
                }

                try {
                    // Attempt to fetch the channel
                    const channel = await message.client.channels.fetch(channelInfo.channelId).catch(() => null);

                    if (!channel) {
                        // Channel does not exist
                        nonExistentChannels.push({
                            channelId: channelInfo.channelId,
                            ownerId: channelInfo.userId
                        });
                        continue;
                    }

                    // Check if channel is archived
                    const archived = await isChannelArchived(channel);
                    if (archived) {
                        archivedChannels.push({
                            channel: `<#${channelInfo.channelId}>`,
                            owner: `<@${channelInfo.userId}>`,
                            channelName: channel.name
                        });
                        continue;
                    }

                    // Attempt to fetch the guild member
                    const member = await message.guild.members.fetch(channelInfo.userId).catch(() => null);

                    if (!member) {
                        // Owner is not in the server
                        deadChannels.push({
                            channel: `<#${channelInfo.channelId}>`,
                            owner: `<@${channelInfo.userId}>`,
                            channelName: channel.name
                        });
                    } else if (!hasRequiredRole(member, requiredRoles)) {
                        // Owner does not have required roles
                        missingRoleChannels.push({
                            channel: `<#${channelInfo.channelId}>`,
                            owner: `<@${channelInfo.userId}>`,
                            channelName: channel.name
                        });
                    }

                } catch (error) {
                    console.error(`Error processing channel for user ${channelInfo.userId}:`, error);
                }
            }

            // Create and send embeds for each category
            const embedFields = [];

            if (deadChannels.length > 0) {
                const deadEmbed = new EmbedBuilder()
                    .setTitle('Channels - Owners Left Server')
                    .setDescription(deadChannels.map(item => `${item.channel} - ${item.owner}`).join('\n'))
                    .setColor(Colors.Red)
                    .setFooter({ text: `Total: ${deadChannels.length} channels` });

                await message.channel.send({ embeds: [deadEmbed] });
                embedFields.push({ name: 'Owners Left Server', value: deadChannels.length.toString(), inline: true });
            }

            if (missingRoleChannels.length > 0) {
                const missingRoleEmbed = new EmbedBuilder()
                    .setTitle('Channels - Owners Missing Required Roles')
                    .setDescription(missingRoleChannels.map(item => `${item.channel} - ${item.owner}`).join('\n'))
                    .setColor(Colors.Yellow)
                    .setFooter({ text: `Total: ${missingRoleChannels.length} channels` });

                await message.channel.send({ embeds: [missingRoleEmbed] });
                embedFields.push({ name: 'Missing Roles', value: missingRoleChannels.length.toString(), inline: true });
            }

            if (archivedChannels.length > 0) {
                const archivedEmbed = new EmbedBuilder()
                    .setTitle('Channels - Already Archived')
                    .setDescription(archivedChannels.map(item => `${item.channel} - ${item.owner}`).join('\n'))
                    .setColor(Colors.Blue)
                    .setFooter({ text: `Total: ${archivedChannels.length} channels` });

                await message.channel.send({ embeds: [archivedEmbed] });
                embedFields.push({ name: 'Already Archived', value: archivedChannels.length.toString(), inline: true });
            }

            if (nonExistentChannels.length > 0) {
                const nonExistentEmbed = new EmbedBuilder()
                    .setTitle('Channels - No Longer Exist')
                    .setDescription(nonExistentChannels.map(item =>
                        `Channel ID: \`${item.channelId}\` - Owner: <@${item.ownerId}>`).join('\n'))
                    .setColor(Colors.Grey)
                    .setFooter({ text: `Total: ${nonExistentChannels.length} channels` });

                await message.channel.send({ embeds: [nonExistentEmbed] });
                embedFields.push({ name: 'Non-existent', value: nonExistentChannels.length.toString(), inline: true });
            }

            // Send a summary embed if at least one category has channels
            if (embedFields.length > 0) {
                const totalChannels = deadChannels.length + missingRoleChannels.length +
                    archivedChannels.length + nonExistentChannels.length;

                const summaryEmbed = new EmbedBuilder()
                    .setTitle('Problematic Channels Summary')
                    .addFields(embedFields)
                    .setColor(Colors.Green)
                    .setFooter({ text: `Total problematic channels: ${totalChannels}` })
                    .setTimestamp();

                await message.channel.send({ embeds: [summaryEmbed] });
            } else {
                await message.channel.send('No problematic channels found!');
            }

        } catch (error) {
            console.error('Error executing deadc command:', error);
            await message.channel.send('An error occurred while processing the command. Please try again later.');
        }
    }
};