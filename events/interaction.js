const { ButtonStyle, ActionRowBuilder, ButtonBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const path = require('path');
const fs = require('fs');

const myChannelCommand = require(path.join(__dirname, '../commands/myc.js'));
const dataPath = './data/channels.json';
const riskPath = './data/risk.json';
const mutesPath = './data/mutes.json';
const streaksPath = './data/streaks.json';

module.exports = {
    name: 'interactionCreate',
    async execute(client, interaction) {
        try {
            if (interaction.isCommand()) {
                const command = client.commands.get(interaction.commandName);
                if (!command) return;
                await command.execute(interaction);
            } else if (interaction.isButton()) {
                console.log(`Button Interaction Detected: ${interaction.customId}`);

                if (interaction.customId === 'delete_snipe' || interaction.customId === 'delete_esnipe') {
                    await handleDeleteSnipe(interaction);
                } else if (['create_channel', 'rename_channel', 'view_friends'].includes(interaction.customId)) {
                    await handleChannelButtons(interaction);  // This logic remains unchanged
                } else if (interaction.customId === 'lb') {
                    await handleLeaderboardButton(interaction); // Handling for leaderboard button
                } else if (interaction.customId === 'info') {
                    await handleInfoButton(interaction); // Handling for info button
                } else if (interaction.customId === 'risk') {
                    await handleRiskButton(interaction); // Handling for risk button
                }
            }
        } catch (error) {
            if (error.name === 'InteractionAlreadyReplied') {
                console.log('Interaction already acknowledged, ignoring:', error.message);
            } else {
                console.error('Error handling interaction:', error);
                try {
                    await interaction.followUp({ 
                        content: 'There was an error while executing this command!', 
                        ephemeral: true 
                    });
                } catch (followUpError) {
                    console.error('Error sending follow-up message:', followUpError);
                }
            }
        }
    }
};

// Re-add the missing button-handling functions from the old code:
async function updateEmbed(interaction, weeklyData) {
    const sortedUsers = Object.entries(weeklyData)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);

    let description = sortedUsers.length > 0
        ? sortedUsers.map(([userId, count], index) => 
            `${index + 1}. <@${userId}> - ${count}`).join('\n')
        : 'No activities recorded this week.';

    const updatedEmbed = new EmbedBuilder()
        .setTitle('Weekly Activity Tracking')
        .setColor(0x6666FF)
        .setDescription(description)
        .setFooter({ text: 'Last updated' })
        .setTimestamp();

    await interaction.message.edit({ embeds: [updatedEmbed] });
}

// Add this to the existing interaction create event handler
if (interaction.isButton()) {
    // Add this case to your existing button handling switch statement
    if (['add_one', 'add_manual', 'remove_manual', 'view_logs', 'view_overall', 'reset_weekly'].includes(interaction.customId)) {
        const activityLogsPath = path.join(__dirname, '../data/activityLogs.json');
        const donoLogsPath = path.join(__dirname, '../data/donoLogs.json');
        let activityData = JSON.parse(fs.readFileSync(activityLogsPath, 'utf8'));
        let donoLogs = JSON.parse(fs.readFileSync(donoLogsPath, 'utf8'));

        if (!activityData.weekly) activityData.weekly = {};
        if (!activityData.logs) activityData.logs = [];

        switch (interaction.customId) {
            case 'add_one':
                activityData.weekly[interaction.user.id] = (activityData.weekly[interaction.user.id] || 0) + 1;
                donoLogs[interaction.user.id] = (donoLogs[interaction.user.id] || 0) + 1;
                
                activityData.logs.push({
                    userId: interaction.user.id,
                    action: 'add',
                    amount: 1,
                    timestamp: Date.now()
                });

                await interaction.reply({ content: 'Added 1 to your count!', ephemeral: true });
                break;

            case 'add_manual':
                const addModal = new ModalBuilder()
                    .setCustomId('add_manual_modal')
                    .setTitle('Add Activity Count');

                const countInput = new TextInputBuilder()
                    .setCustomId('count_input')
                    .setLabel('Enter the count to add')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const firstActionRow = new ActionRowBuilder().addComponents(countInput);
                addModal.addComponents(firstActionRow);

                await interaction.showModal(addModal);
                return;

            case 'remove_manual':
                const removeModal = new ModalBuilder()
                    .setCustomId('remove_manual_modal')
                    .setTitle('Remove Activity Count');

                const removeInput = new TextInputBuilder()
                    .setCustomId('count_input')
                    .setLabel('Enter the count to remove')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const removeActionRow = new ActionRowBuilder().addComponents(removeInput);
                removeModal.addComponents(removeActionRow);

                await interaction.showModal(removeModal);
                return;

            case 'view_logs':
                const recentLogs = activityData.logs.slice(-10).reverse()
                    .map(log => {
                        const action = log.action === 'add' ? 'added' : 'removed';
                        return `<@${log.userId}> ${action} ${log.amount} at <t:${Math.floor(log.timestamp / 1000)}:R>`;
                    }).join('\n');

                const logsEmbed = new EmbedBuilder()
                    .setTitle('Recent Activity Logs')
                    .setDescription(recentLogs || 'No recent logs')
                    .setColor(0x6666FF);

                await interaction.reply({ embeds: [logsEmbed], ephemeral: true });
                break;

            case 'view_overall':
                const sortedOverall = Object.entries(donoLogs)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 10);

                const overallEmbed = new EmbedBuilder()
                    .setTitle('Overall Top 10 Activities')
                    .setDescription(
                        sortedOverall.map(([userId, count], index) => 
                            `${index + 1}. <@${userId}> - ${count}`).join('\n')
                    )
                    .setColor(0x6666FF);

                await interaction.reply({ embeds: [overallEmbed], ephemeral: true });
                break;

            case 'reset_weekly':
                if (!interaction.member.permissions.has('ADMINISTRATOR')) {
                    return await interaction.reply({ content: 'You do not have permission to reset the weekly tracking.', ephemeral: true });
                }

                activityData.weekly = {};
                await interaction.reply({ content: 'Weekly tracking has been reset!', ephemeral: true });
                break;
        }

        fs.writeFileSync(donoLogsPath, JSON.stringify(donoLogs, null, 2));
        fs.writeFileSync(activityLogsPath, JSON.stringify(activityData, null, 2));
        await updateEmbed(interaction, activityData.weekly);
    }
} else if (interaction.isModalSubmit()) {
    if (interaction.customId === 'add_manual_modal' || interaction.customId === 'remove_manual_modal') {
        const activityLogsPath = path.join(__dirname, '../data/activityLogs.json');
        const donoLogsPath = path.join(__dirname, '../data/donoLogs.json');
        let activityData = JSON.parse(fs.readFileSync(activityLogsPath, 'utf8'));
        let donoLogs = JSON.parse(fs.readFileSync(donoLogsPath, 'utf8'));

        const count = parseInt(interaction.fields.getTextInputValue('count_input'));
        if (isNaN(count) || count < 1) {
            return await interaction.reply({ content: 'Please enter a valid positive number.', ephemeral: true });
        }

        if (interaction.customId === 'add_manual_modal') {
            activityData.weekly[interaction.user.id] = (activityData.weekly[interaction.user.id] || 0) + count;
            donoLogs[interaction.user.id] = (donoLogs[interaction.user.id] || 0) + count;

            activityData.logs.push({
                userId: interaction.user.id,
                action: 'add',
                amount: count,
                timestamp: Date.now()
            });

            await interaction.reply({ content: `Added ${count} to your count!`, ephemeral: true });
        } else if (interaction.customId === 'remove_manual_modal') {
            const currentCount = activityData.weekly[interaction.user.id] || 0;
            if (count > currentCount) {
                return await interaction.reply({ content: 'Cannot remove more than your current count.', ephemeral: true });
            }

            activityData.weekly[interaction.user.id] = currentCount - count;
            donoLogs[interaction.user.id] = (donoLogs[interaction.user.id] || 0) - count;

            activityData.logs.push({
                userId: interaction.user.id,
                action: 'remove',
                amount: count,
                timestamp: Date.now()
            });

            await interaction.reply({ content: `Removed ${count} from your count!`, ephemeral: true });
        }

        fs.writeFileSync(donoLogsPath, JSON.stringify(donoLogs, null, 2));
        fs.writeFileSync(activityLogsPath, JSON.stringify(activityData, null, 2));
        await updateEmbed(interaction, activityData.weekly);
    }
}
async function handleDeleteSnipe(interaction) {
    const message = interaction.message;

    const originalCommandMessage = await interaction.channel.messages.fetch({ limit: 100 }).then(messages => {
        return messages.find(msg => 
            msg.content.startsWith(',snipe') || 
            msg.content.startsWith(',esnipe')
        );
    });

    if (!originalCommandMessage) {
        console.log('Original command message not found');
        return await interaction.reply({
            content: 'Unable to verify the original command user.',
            ephemeral: true
        });
    }

    if (interaction.user.id !== originalCommandMessage.author.id) {
        console.log(`Unauthorized delete attempt by ${interaction.user.tag}`);
        return await interaction.reply({
            content: 'You are not allowed to delete this message.',
            ephemeral: true
        });
    }

    try {
        if (message) {
            console.log('Embed message found. Deleting...');
            await message.delete();
            console.log('Embed message deleted.');
        }

        if (originalCommandMessage) {
            console.log('Original command message found. Deleting...');
            await originalCommandMessage.delete();
            console.log('Original command message deleted.');
        }

        await interaction.reply({ content: 'Deleted the snipe/esnipe message and the command.', ephemeral: true });
    } catch (error) {
        console.error(`Error deleting message: ${error}`);
        await interaction.reply({ content: 'Failed to delete the message.', ephemeral: true });
    }
}

async function handleLeaderboardButton(interaction) {
    let streakData = {};

    try {
        const data = fs.readFileSync(streaksPath, 'utf8');
        streakData = JSON.parse(data);
    } catch (error) {
        console.error(`Error reading streaks file: ${error}`);
        return await interaction.reply({ content: 'Failed to load leaderboard data.', ephemeral: true });
    }

    if (!streakData.users || !Array.isArray(streakData.users)) {
        return await interaction.reply({ content: 'No streak data available.', ephemeral: true });
    }

    const sortedStreaks = streakData.users
        .sort((a, b) => b.streak - a.streak)
        .slice(0, 5);

    const leaderboardEntries = await Promise.all(sortedStreaks.map(async (user, index) => {
        const rankEmojis = [
            '<:One:1043063155653357568>',
            '<:Two:1043063239493300294>',
            '<:Three:1043063324423757885>',
            '<:Four:1043085748796129301>',
            '<:Five:1043085910432030760>'
        ];
        const rankEmoji = rankEmojis[index] || '';

        const fetchedUser = await interaction.client.users.fetch(user.userId).catch(() => null);
        const userTag = fetchedUser ? fetchedUser.tag : 'Unknown User';

        const userEmoji = interaction.user.id === user.userId ? '<:sweg:1010054002202906634>' : '';
        
        return `${rankEmoji} ┊ ${userTag} - ${user.streak} ${userEmoji}`;
    }));

    const yourRank = sortedStreaks.findIndex(user => user.userId === interaction.user.id) + 1 || 0;

    const lbEmbed = new EmbedBuilder()
        .setTitle('Leaderboard: Streak')
        .setColor(0x6666FF)
        .setDescription(leaderboardEntries.join('\n') || 'No streaks available.')
        .setFooter({ text: `Your rank: ${yourRank}` });

    await interaction.reply({ embeds: [lbEmbed], ephemeral: true });
}

async function handleInfoButton(interaction) {
    const memberRoles = interaction.member.roles.cache;

    const baseRoles = {
        '866641313754251297': 75, 
        '866641299355861022': 75, 
        '866641249452556309': 70,
        '866641177943080960': 65, 
        '866641062441254932': 60, 
        '946729964328337408': 75, 
        '768449168297033769': 70, 
        '768448955804811274': 65, 
        '1038106794200932512': 75, 
        '1028256279124250624': 70, 
        '1028256286560763984': 65,
        '1030707878597763103': 60,
        '721331975847411754': 65, 
    };

    const boosterRoles = {
        '721331975847411754': 5,
        '721020858818232343': 5,
        '713452411720827013': 5
    };

    let luck = 0;
    let highestBaseRole = null;
    let boosterLuck = 0;
    let contributingRoles = [];

    for (const [roleId, luckValue] of Object.entries(baseRoles)) {
        if (memberRoles.has(roleId)) {
            if (luckValue > luck) {
                luck = luckValue;
                highestBaseRole = `<@&${roleId}> (Base Luck: ${luckValue}%)`;
            }
        }
    }

    for (const [roleId, boostValue] of Object.entries(boosterRoles)) {
        if (memberRoles.has(roleId)) {
            boosterLuck += boostValue;
            contributingRoles.push(`<@&${roleId}> (Booster Luck: +${boostValue}%)`);
        }
    }

    const totalLuck = Math.min(luck + boosterLuck, 100);

    if (!highestBaseRole) {
        contributingRoles.push('No base luck roles assigned.');
    }

    const luckEmbed = new EmbedBuilder()
        .setTitle('Luck Information')
        .setColor(0x6666FF)
        .setDescription(`----------- Your Luck: **${totalLuck}%** -----------`)
        .addFields(
            { name: 'Highest Base Role', value: highestBaseRole || 'None' },
            { name: 'Contributing Roles', value: contributingRoles.join('\n') || 'None' },
            { name: '----------- Base Roles -----------', 
                value: Object.entries(baseRoles).map(([roleId, luckValue]) => `<@&${roleId}> (Luck: ${luckValue}%)`).join('\n') || 'None' 
            },
            { name: '----------- Booster Roles -----------', 
                value: Object.entries(boosterRoles).map(([roleId, boostValue]) => `<@&${roleId}> (Luck: +${boostValue}%)`).join('\n') || 'None' 
            }
        )
        .setFooter({ text: 'Luck is calculated based on your roles.' });

    await interaction.reply({ embeds: [luckEmbed], ephemeral: true });
}

async function handleRiskButton(interaction) {
    try {
        await interaction.deferUpdate();

        const mutedRole = interaction.guild.roles.cache.get('673978861335085107');
        if (!interaction.member.roles.cache.has(mutedRole.id)) {
            return await interaction.followUp({ content: 'This button is only for muted users.', ephemeral: true });
        }

        let mutesData = { users: [] };
        try {
            const data = fs.readFileSync(mutesPath, 'utf8');
            mutesData = JSON.parse(data);
        } catch (error) {
            console.error(`Error reading mutes.json: ${error}`);
            return await interaction.followUp({ content: 'An error occurred while processing your request.', ephemeral: true });
        }

        const userMute = mutesData.users.find(mute => mute.userId === interaction.user.id);
        if (!userMute) {
            return await interaction.followUp({ content: 'No mute data found for you.', ephemeral: true });
        }

        if (userMute.button_clicked) {
            return await interaction.followUp({ content: 'You have already used the risk button for this mute.', ephemeral: true });
        }

        const currentTime = Math.floor(Date.now() / 1000);
        const remainingTime = userMute.muteEndTime - currentTime;

        if (remainingTime <= 0) {
            return await interaction.followUp({ content: 'Your mute has already expired.', ephemeral: true });
        }

        const success = Math.random() < 0.5;
        let responseMessage;

        if (success) {
            await interaction.member.roles.remove(mutedRole);
            responseMessage = `${interaction.user} took the risk and succeeded. They are no longer muted!`;
            // Mark the button as clicked but don't remove the mute data
            userMute.button_clicked = true;
        } else {
            const newDuration = remainingTime * 2;
            const newEndTime = currentTime + newDuration;
            responseMessage = `${interaction.user} took the risk and failed miserably. Mute duration is now doubled to **${Math.floor(newDuration)}** seconds.`;
            // Update the user's mute data
            userMute.muteEndTime = newEndTime;
            userMute.button_clicked = true;
            // Set up the new unmute timeout
            setTimeout(() => {
                interaction.member.roles.remove(mutedRole).catch(console.error);
                mutesData.users = mutesData.users.filter(mute => mute.userId !== interaction.user.id);
                fs.writeFile(mutesPath, JSON.stringify(mutesData, null, 2), (err) => {
                    if (err) console.error('Error updating mutes data:', err);
                });
            }, newDuration * 1000);
        }

        fs.writeFile(mutesPath, JSON.stringify(mutesData, null, 2), (err) => {
            if (err) console.error('Error writing mutes data:', err);
        });

        await interaction.followUp({ content: responseMessage }); // Non-ephemeral message for success/failure
    } catch (error) {
        console.error('Error in handleRiskButton:', error);
        await interaction.followUp({ content: 'An error occurred while processing your request.', ephemeral: true });
    }
}

function calculateMaxFriends(member) {
    const roleLimits = {
        '768448955804811274': 5,
        '768449168297033769': 5,
        '946729964328337408': 5,
        '1028256286560763984': 5,
        '1028256279124250624': 5,
        '1038106794200932512': 5,
    };

    let maxFriends = 0;

    for (const [roleId, limit] of Object.entries(roleLimits)) {
        if (member.roles.cache.has(roleId)) {
            maxFriends += limit;
        }
    }

    return maxFriends;
}
