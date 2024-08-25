const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('assign')
        .setDescription('Admin-only command to assign the current channel to a specified user.')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user to whom you want to assign this channel.')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
        
    async execute(interaction) {
        console.log('Executing assign command');

        const targetUser = interaction.options.getUser('user');
        const channel = interaction.channel;

        if (!targetUser) {
            await interaction.reply({ content: 'Please specify a valid user.', ephemeral: true });
            return;
        }

        try {
            // Read and parse the channels.json file
            const channelsDataPath = path.join(__dirname, '../data/channels.json');
            const channelsData = JSON.parse(fs.readFileSync(channelsDataPath, 'utf8'));

            // Get permission overwrites of the channel
            const overwrites = channel.permissionOverwrites.cache;

            // Filter out members with explicit View Channel permissions and exclude bots
            const visibleMembers = await Promise.all(overwrites.filter(overwrite => {
                return overwrite.type === 1 && // Type 1 for member (user-specific)
                    overwrite.allow.has('ViewChannel'); // Check if View Channel permission is explicitly allowed
            }).map(async overwrite => {
                const member = await interaction.guild.members.fetch(overwrite.id).catch(() => null);
                return member && !member.user.bot ? member : null; // Return member if not a bot, otherwise null
            }));

            // Filter out null values (which represent bots or failed fetches) and exclude the assigned user
            const nonBotMembers = visibleMembers.filter(member => member !== null && member.id !== targetUser.id);

            // Update channels.json with the assigned user and their friends list
            channelsData[targetUser.id] = {
                userId: targetUser.id,
                channelId: channel.id,
                createdAt: new Date().toISOString(),
                friends: nonBotMembers.map(member => member.id) // List of friend IDs excluding the target user
            };

            // Write updated data back to channels.json
            fs.writeFileSync(channelsDataPath, JSON.stringify(channelsData, null, 2));

            // Prepare the embed response message
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('Channel Assigned')
                .setDescription(`Channel <#${channel.id}> has been successfully assigned to <@${targetUser.id}>.`)
                .addFields(
                    { name: 'User', value: `<@${targetUser.id}>`, inline: true },
                    { name: 'Channel', value: `<#${channel.id}>`, inline: true }
                );

            if (nonBotMembers.length > 0) {
                embed.addFields({
                    name: 'Logged existing friends into the system.',
                    value: nonBotMembers.map(member => `<@${member.id}>`).join('\n'),
                    inline: false
                });
            } else {
                embed.addFields({
                    name: 'No existing friends to add.',
                    value: 'No other members found in the channel.',
                    inline: false
                });
            }

            // Send response as an embed (non-ephemeral message)
            await interaction.reply({ embeds: [embed], ephemeral: false });

            // Automatically trigger the viewchannel command
            const viewChannelCommand = interaction.client.commands.get('viewchannel');
            if (viewChannelCommand) {
                // Create a dummy interaction object for triggering viewchannel
                const dummyInteraction = {
                    ...interaction,
                    commandName: 'viewchannel',
                    options: { getChannel: () => channel },
                    reply: interaction.reply.bind(interaction) // Mock reply method to handle response
                };
                await viewChannelCommand.execute(dummyInteraction);
            }
        } catch (error) {
            console.error('Error assigning channel:', error);
            await interaction.reply({ content: 'There was an error assigning the channel. Please try again.', ephemeral: false });
        }
    },
};
