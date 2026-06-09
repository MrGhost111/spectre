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

            // Remove every entry that references this user OR this channel.
            // This guarantees both are unique in the file — no duplicates possible.
            for (const [userId, data] of Object.entries(channelsData)) {
                if (!data || typeof data !== 'object') continue;

                const isThisUser = userId === targetUser.id;
                const isThisChannel = data.channelId === selectedChannel.id;

                if (isThisUser || isThisChannel) {
                    // Revoke view permission from whoever held this slot
                    const slotChannel = isThisChannel
                        ? selectedChannel
                        : interaction.guild.channels.cache.get(data.channelId);

                    if (slotChannel) {
                        const oldMember = await interaction.guild.members.fetch(userId).catch(() => null);
                        if (oldMember) {
                            await slotChannel.permissionOverwrites.edit(oldMember, { ViewChannel: false }).catch(() => { });
                        }
                    }
                    delete channelsData[userId];
                }
            }

            // Move channel back to main category if it was archived
            const category = await interaction.guild.channels.fetch(CHANNEL_CATEGORY_ID).catch(() => null);
            if (category && selectedChannel.parentId !== CHANNEL_CATEGORY_ID) {
                await selectedChannel.setParent(CHANNEL_CATEGORY_ID, { lockPermissions: false });
            }

            // Collect friends already in the channel (non-bot members with explicit ViewChannel)
            const overwrites = selectedChannel.permissionOverwrites.cache;
            const visibleMembers = await Promise.all(
                overwrites
                    .filter(ow => ow.type === 1 && ow.allow.has('ViewChannel'))
                    .map(async ow => {
                        const member = await interaction.guild.members.fetch(ow.id).catch(() => null);
                        return member && !member.user.bot ? member : null;
                    })
            );
            const friends = visibleMembers
                .filter(m => m !== null && m.id !== targetUser.id)
                .map(m => m.id);

            // Write the single authoritative entry
            channelsData[targetUser.id] = {
                userId: targetUser.id,
                channelId: selectedChannel.id,
                createdAt: new Date().toISOString(),
                friends,
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

            if (friends.length > 0) {
                embed.addFields({ name: 'Existing friends carried over', value: friends.map(id => `<@${id}>`).join('\n'), inline: false });
            } else {
                embed.addFields({ name: 'No existing friends', value: 'No other members found in the channel.', inline: false });
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