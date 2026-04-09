// JavaScript source code
const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

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

module.exports = async function handleActivityButtons(interaction) {
    let activityData = JSON.parse(fs.readFileSync(activityLogsPath, 'utf8'));
    let donoLogs = JSON.parse(fs.readFileSync(donoLogsPath, 'utf8'));

    if (!activityData.weekly) activityData.weekly = {};
    if (!activityData.logs) activityData.logs = [];

    switch (interaction.customId) {

        case 'add_one':
            activityData.weekly[interaction.user.id] = (activityData.weekly[interaction.user.id] || 0) + 1;
            donoLogs[interaction.user.id] = (donoLogs[interaction.user.id] || 0) + 1;
            activityData.logs.push({ userId: interaction.user.id, action: 'add', amount: 1, timestamp: Date.now() });
            await interaction.reply({ content: 'Added 1 to your count!', ephemeral: true });
            break;

        case 'add_manual': {
            const modal = new ModalBuilder().setCustomId('add_manual_modal').setTitle('Add Activity Count');
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('count_input').setLabel('Enter the count to add').setStyle(TextInputStyle.Short).setRequired(true)
            ));
            await interaction.showModal(modal);
            return; // don't save yet — modal submit handles it
        }

        case 'remove_manual': {
            const modal = new ModalBuilder().setCustomId('remove_manual_modal').setTitle('Remove Activity Count');
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('count_input').setLabel('Enter the count to remove').setStyle(TextInputStyle.Short).setRequired(true)
            ));
            await interaction.showModal(modal);
            return; // don't save yet — modal submit handles it
        }

        case 'view_logs': {
            const recentLogs = activityData.logs.slice(-10).reverse()
                .map(log => {
                    const action = log.action === 'add' ? 'added' : 'removed';
                    return `<@${log.userId}> ${action} ${log.amount} at <t:${Math.floor(log.timestamp / 1000)}:R>`;
                }).join('\n');

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('Recent Activity Logs')
                    .setDescription(recentLogs || 'No recent logs')
                    .setColor(0x6666FF)],
                ephemeral: true
            });
            return;
        }

        case 'view_overall': {
            const sortedOverall = Object.entries(donoLogs)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10);

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('Overall Top 10 Activities')
                    .setDescription(sortedOverall.map(([userId, count], i) => `${i + 1}. <@${userId}> - ${count}`).join('\n'))
                    .setColor(0x6666FF)],
                ephemeral: true
            });
            return;
        }

        case 'reset_weekly': {
            if (!interaction.member.permissions.has('ADMINISTRATOR')) {
                return interaction.reply({ content: 'You do not have permission to reset the weekly tracking.', ephemeral: true });
            }

            const confirmMessage = await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('Reset Weekly Tracking')
                    .setDescription('Are you sure you want to reset the weekly tracking? This action cannot be undone.')
                    .setColor(0xFF0000)],
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('confirm_reset_yes').setLabel('Yes').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('confirm_reset_no').setLabel('No').setStyle(ButtonStyle.Secondary)
                )],
                ephemeral: true,
                fetchReply: true
            });

            const filter = i =>
                ['confirm_reset_yes', 'confirm_reset_no', 'assign_role_yes', 'assign_role_no'].includes(i.customId) &&
                i.user.id === interaction.user.id;
            const collector = confirmMessage.createMessageComponentCollector({ filter, time: 15000 });

            collector.on('collect', async i => {
                if (i.customId === 'confirm_reset_yes') {
                    const weeklyPath = path.join(__dirname, '../../data/weekly.json');
                    fs.writeFileSync(weeklyPath, JSON.stringify(activityData.weekly, null, 2));
                    activityData.weekly = {};
                    fs.writeFileSync(activityLogsPath, JSON.stringify(activityData, null, 2));
                    await updateEmbed(interaction, activityData.weekly);

                    await i.update({
                        embeds: [new EmbedBuilder()
                            .setTitle('Assign Ultimate Staff Host Role')
                            .setDescription('Do you want to assign the Ultimate Staff Host role to the top user?')
                            .setColor(0x0099FF)],
                        components: [new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('assign_role_yes').setLabel('Yes').setStyle(ButtonStyle.Primary),
                            new ButtonBuilder().setCustomId('assign_role_no').setLabel('No').setStyle(ButtonStyle.Secondary)
                        )]
                    });

                } else if (i.customId === 'confirm_reset_no') {
                    await i.update({ content: 'Reset action has been canceled.', embeds: [], components: [] });

                } else if (i.customId === 'assign_role_yes') {
                    const weeklyPath = path.join(__dirname, '../../data/weekly.json');
                    const savedWeeklyData = JSON.parse(fs.readFileSync(weeklyPath, 'utf8'));
                    const topUser = Object.entries(savedWeeklyData).sort(([, a], [, b]) => b - a)[0];

                    if (topUser) {
                        const topMember = await interaction.guild.members.fetch(topUser[0]).catch(() => null);
                        if (topMember) {
                            await topMember.roles.add('713452411720827013');
                            await i.update({ content: 'Ultimate Staff Host role has been assigned to the top user!', embeds: [], components: [] });
                        } else {
                            await i.update({ content: 'Top user not found in the guild!', embeds: [], components: [] });
                        }
                    } else {
                        await i.update({ content: 'No top user found to assign the role to.', embeds: [], components: [] });
                    }

                } else if (i.customId === 'assign_role_no') {
                    await i.update({ content: 'Ultimate Staff Host role assignment has been skipped.', embeds: [], components: [] });
                }
            });

            collector.on('end', async (_, reason) => {
                if (reason === 'time') {
                    try {
                        await confirmMessage.edit({ content: 'Confirmation timed out.', components: [], embeds: [] });
                    } catch (e) { console.error('Error updating timed out message:', e); }
                }
            });
            return; // collector handles everything from here
        }
    }

    // Save and update embed for non-modal, non-collector buttons
    fs.writeFileSync(donoLogsPath, JSON.stringify(donoLogs, null, 2));
    fs.writeFileSync(activityLogsPath, JSON.stringify(activityData, null, 2));
    await updateEmbed(interaction, activityData.weekly);
};