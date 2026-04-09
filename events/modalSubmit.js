// JavaScript source code
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../../data/channels.json');
const activityLogsPath = path.join(__dirname, '../../data/activityLogs.json');
const donoLogsPath = path.join(__dirname, '../../data/donoLogs.json');

async function updateEmbed(interaction, weeklyData) {
    const sortedUsers = Object.entries(weeklyData)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);

    const description = sortedUsers.length > 0
        ? sortedUsers.map(([userId, count], i) => `${i + 1}. <@${userId}> - ${count}`).join('\n')
        : 'No activities recorded this week.';

    await interaction.message.edit({
        embeds: [new EmbedBuilder()
            .setTitle('Weekly Activity Tracking')
            .setColor(0x6666FF)
            .setDescription(description)
            .setFooter({ text: 'Last updated' })
            .setTimestamp()]
    });
}

module.exports = async function handleModalSubmit(interaction) {

    // ── Channel modals ─────────────────────────────────────────────────────────
    if (interaction.customId === 'create_channel_modal' || interaction.customId === 'rename_channel_modal') {
        await interaction.deferReply({ ephemeral: true });

        let channelsData;
        try {
            channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        } catch (_) {
            channelsData = { channels: {} };
        }

        if (interaction.customId === 'create_channel_modal') {
            const channelName = interaction.fields.getTextInputValue('channel_name_input');
            if (!channelName || channelName.length < 1) {
                return interaction.followUp({ content: 'Please provide a valid channel name.', ephemeral: true });
            }

            const hasChannel = Object.values(channelsData).some(entry =>
                entry.userId === interaction.user.id && entry.channelId && entry.createdAt
            );
            if (hasChannel) {
                return interaction.followUp({ content: 'You already own a channel.', ephemeral: true });
            }

            const categoryIds = [
                '799997847931977749',
                '842471433238347786',
                '1064095644811284490'
            ];

            let channel = null;
            let lastError = null;

            for (const categoryId of categoryIds) {
                try {
                    const category = await interaction.guild.channels.fetch(categoryId);
                    if (!category) continue;

                    const allChannels = await interaction.guild.channels.fetch();
                    const channelsInCategory = allChannels.filter(ch => ch.parentId === categoryId);

                    if (channelsInCategory.size >= 50) continue;

                    channel = await interaction.guild.channels.create({
                        name: channelName,
                        type: 0, // GuildText
                        parent: categoryId,
                        permissionOverwrites: [
                            ...category.permissionOverwrites.cache.map(p => ({
                                id: p.id,
                                allow: p.allow,
                                deny: p.deny
                            })),
                            { id: interaction.user.id, allow: ['ViewChannel'] }
                        ]
                    });
                    break;
                } catch (e) {
                    lastError = e;
                    console.error(`Error creating channel in category ${categoryId}:`, e);
                }
            }

            if (!channel) {
                return interaction.followUp({
                    content: `Failed to create channel. ${lastError ? `Error: ${lastError.message}` : 'All categories are either full or unavailable.'}`,
                    ephemeral: true
                });
            }

            channelsData[interaction.user.id] = {
                userId: interaction.user.id,
                channelId: channel.id,
                createdAt: new Date().toISOString(),
                friends: []
            };
            fs.writeFileSync(dataPath, JSON.stringify(channelsData, null, 2));

            return interaction.followUp({ content: `Channel ${channel} has been created successfully!`, ephemeral: true });
        }

        if (interaction.customId === 'rename_channel_modal') {
            try {
                const newChannelName = interaction.fields.getTextInputValue('new_channel_name_input');
                if (!newChannelName || newChannelName.length < 1) {
                    return interaction.followUp({ content: 'Please provide a valid channel name.', ephemeral: true });
                }

                const userChannel = Object.values(channelsData).find(ch => ch.userId === interaction.user.id);
                if (!userChannel) {
                    return interaction.followUp({ content: 'You do not own a channel.', ephemeral: true });
                }

                const channel = interaction.guild.channels.cache.get(userChannel.channelId);
                if (!channel) {
                    return interaction.followUp({ content: 'Channel not found.', ephemeral: true });
                }

                await channel.setName(newChannelName);
                return interaction.followUp({ content: `Channel has been renamed to ${channel}!`, ephemeral: true });
            } catch (error) {
                console.error('Error in rename_channel_modal:', error);
                return interaction.followUp({ content: 'There was an error while renaming the channel.', ephemeral: true });
            }
        }
    }

    // ── Activity modals ────────────────────────────────────────────────────────
    if (interaction.customId === 'add_manual_modal' || interaction.customId === 'remove_manual_modal') {
        let activityData = JSON.parse(fs.readFileSync(activityLogsPath, 'utf8'));
        let donoLogs = JSON.parse(fs.readFileSync(donoLogsPath, 'utf8'));

        const count = parseInt(interaction.fields.getTextInputValue('count_input'));
        if (isNaN(count) || count < 1) {
            return interaction.reply({ content: 'Please enter a valid positive number.', ephemeral: true });
        }

        if (interaction.customId === 'add_manual_modal') {
            activityData.weekly[interaction.user.id] = (activityData.weekly[interaction.user.id] || 0) + count;
            donoLogs[interaction.user.id] = (donoLogs[interaction.user.id] || 0) + count;
            activityData.logs.push({ userId: interaction.user.id, action: 'add', amount: count, timestamp: Date.now() });
            await interaction.reply({ content: `Added ${count} to your count!`, ephemeral: true });

        } else {
            const currentCount = activityData.weekly[interaction.user.id] || 0;
            if (count > currentCount) {
                return interaction.reply({ content: 'Cannot remove more than your current count.', ephemeral: true });
            }
            activityData.weekly[interaction.user.id] = currentCount - count;
            donoLogs[interaction.user.id] = (donoLogs[interaction.user.id] || 0) - count;
            activityData.logs.push({ userId: interaction.user.id, action: 'remove', amount: count, timestamp: Date.now() });
            await interaction.reply({ content: `Removed ${count} from your count!`, ephemeral: true });
        }

        fs.writeFileSync(donoLogsPath, JSON.stringify(donoLogs, null, 2));
        fs.writeFileSync(activityLogsPath, JSON.stringify(activityData, null, 2));
        await updateEmbed(interaction, activityData.weekly);
    }
};