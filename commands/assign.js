const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const CHANNEL_CATEGORY_ID = '1064095644811284490';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('assign')
        .setDescription('Admin-only command to assign a specified channel to a user.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to assign the channel to.')
                .setRequired(true)
        )
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The text channel to assign.')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const selectedChannel = interaction.options.getChannel('channel');
        const channelsDataPath = path.join(__dirname, '../data/channels.json');
        let channelsData;

        await interaction.deferReply({ ephemeral: true });

        try {
            channelsData = JSON.parse(fs.readFileSync(channelsDataPath, 'utf8'));

            // --- FIX 1: Remove any existing entry where THIS USER is the owner ---
            // (revoke their old channel's view permission too)
            const existingEntryForUser = channelsData[targetUser.id];
            if (existingEntryForUser) {
                const oldChannel = interaction.guild.channels.cache.get(existingEntryForUser.channelId);
                if (oldChannel) {
                    await oldChannel.permissionOverwrites.edit(targetUser, { ViewChannel: false });
                }
                delete channelsData[targetUser.id];
            }

            // --- FIX 2: Remove any existing entry where THIS CHANNEL is already assigned ---
            // This is what caused the "owner left" ghost: the channel had a stale userId from
            // its previous owner, so viewc #channel found that old entry and couldn't fetch them.
            for (const [userId, data] of Object.entries(channelsData)) {
                if (data && typeof data === 'object' && data.channelId === selectedChannel.id) {
                    // Revoke the old owner's view permission if they're still in the server
                    const oldOwner = interaction.guild.members.cache.get(userId);
                    if (oldOwner) {
                        await selectedChannel.permissionOverwrites.edit(oldOwner, { ViewChannel: false }).catch(() => { });
                    }
                    delete channelsData[userId];
                    break;
                }
            }

            // --- FIX 3: Move channel back to the main category if it was archived ---
            const category = await interaction.guild.channels.fetch(CHANNEL_CATEGORY_ID).catch(() => null);
            if (category && selectedChannel.parentId !== CHANNEL_CATEGORY_ID) {
                await selectedChannel.setParent(CHANNEL_CATEGORY_ID, { lockPermissions: false });
            }

            // Get members who already have explicit ViewChannel permission in this channel
            const overwrites = selectedChannel.permissionOverwrites.cache;
            const visibleMembers = await Promise.all(
                overwrites
                    .filter(overwrite => overwrite.type === 1 && overwrite.allow.has('ViewChannel'))
                    .map(async overwrite => {
                        const member = await interaction.guild.members.fetch(overwrite.id).catch(() => null);
                        return member && !member.user.bot ? member : null;
                    })
            );

            const nonBotMembers = visibleMembers.filter(
                member => member !== null && member.id !== targetUser.id
            );

            // Write the new entry — userId field matches the key, no mismatch possible
            channelsData[targetUser.id] = {
                userId: targetUser.id,
                channelId: selectedChannel.id,
                createdAt: new Date().toISOString(),
                friends: nonBotMembers.map(member => member.id),
            };

            fs.writeFileSync(channelsDataPath, JSON.stringify(channelsData, null, 2));

            // Grant the new owner view access
            await selectedChannel.permissionOverwrites.edit(targetUser, { ViewChannel: true });

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('Channel Assigned')
                .setDescription(`Channel <#${selectedChannel.id}> has been successfully assigned to <@${targetUser.id}>.`)
                .addFields(
                    { name: 'User', value: `<@${targetUser.id}>`, inline: true },
                    { name: 'Channel', value: `<#${selectedChannel.id}>`, inline: true }
                );

            if (nonBotMembers.length > 0) {
                embed.addFields({
                    name: 'Existing friends added',
                    value: nonBotMembers.map(member => `<@${member.id}>`).join('\n'),
                    inline: false,
                });
            } else {
                embed.addFields({
                    name: 'No existing friends to add',
                    value: 'No other members found in the channel.',
                    inline: false,
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error assigning channel:', error);
            if (!interaction.replied) {
                await interaction.editReply({ content: 'There was an error assigning the channel. Please try again.' });
            }
        }
    },
};