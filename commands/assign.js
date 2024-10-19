const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

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

        // Defer the reply to give yourself more time
        await interaction.deferReply({ ephemeral: true });

        try {
            // Read and parse the channels.json file
            channelsData = JSON.parse(fs.readFileSync(channelsDataPath, 'utf8'));

            // Check if the user already has a channel
            const existingChannel = channelsData[targetUser.id];
            if (existingChannel) {
                // Remove permissions for the old channel
                const oldChannel = interaction.guild.channels.cache.get(existingChannel.channelId);
                if (oldChannel) {
                    await oldChannel.permissionOverwrites.edit(targetUser, { ViewChannel: false });
                }
                // Replace the old channel with the new one in channels.json
                delete channelsData[targetUser.id];
            }

            // Get permission overwrites of the new channel
            const overwrites = selectedChannel.permissionOverwrites.cache;

            // Filter out members with explicit View Channel permissions and exclude bots
            const visibleMembers = await Promise.all(overwrites.filter(overwrite => {
                return overwrite.type === 1 && // Type 1 for member (user-specific)
                    overwrite.allow.has('ViewChannel'); // Check if View Channel permission is explicitly allowed
            }).map(async overwrite => {
                const member = await interaction.guild.members.fetch(overwrite.id).catch(() => null);
                return member && !member.user.bot ? member : null; // Return member if not a bot
            }));

            // Filter out null values (bots or failed fetches) and exclude the assigned user
            const nonBotMembers = visibleMembers.filter(member => member !== null && member.id !== targetUser.id);

            // Update channels.json with the new channel and user's friends list
            channelsData[targetUser.id] = {
                userId: targetUser.id,
                channelId: selectedChannel.id,
                createdAt: new Date().toISOString(),
                friends: nonBotMembers.map(member => member.id) // List of friend IDs excluding the target user
            };

            // Write updated data back to channels.json
            fs.writeFileSync(channelsDataPath, JSON.stringify(channelsData, null, 2));

            // Add the owner to the new channel with ViewChannel permission
            await selectedChannel.permissionOverwrites.edit(targetUser, { ViewChannel: true });

            // Prepare the embed response message
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
                    inline: false
                });
            } else {
                embed.addFields({
                    name: 'No existing friends to add',
                    value: 'No other members found in the channel.',
                    inline: false
                });
            }

            // Send the final response as an edited deferred reply
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error assigning channel:', error);
            // Only reply once if not already replied
            if (!interaction.replied) {
                await interaction.editReply({ content: 'There was an error assigning the channel. Please try again.' });
            }
        }
    },
};
