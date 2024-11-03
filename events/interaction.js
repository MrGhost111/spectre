const { ButtonStyle, ChannelType, ActionRowBuilder, ButtonBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
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
                    await handleChannelButtons(interaction);
                } else if (interaction.customId === 'lb') {
                    await handleLeaderboardButton(interaction);
                } else if (interaction.customId === 'info') {
                    await handleInfoButton(interaction);
                } else if (interaction.customId === 'risk') {
                    await handleRiskButton(interaction);
                } else if (['add_one', 'add_manual', 'remove_manual', 'view_logs', 'view_overall', 'reset_weekly'].includes(interaction.customId)) {
                    await handleActivityButtons(interaction);
                }
            } else if (interaction.isModalSubmit()) {
                await handleModalSubmit(interaction);
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

async function handleChannelButtons(interaction) {
    try {
        const channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        const userChannel = Object.values(channelsData).find(ch => ch.userId === interaction.user.id);

        if (interaction.customId === 'rename_channel' || interaction.customId === 'view_friends') {
            const channelOwnerId = interaction.message.embeds[0]?.footer?.text?.replace('Channel Owner ID: ', '');
            if (interaction.user.id !== channelOwnerId) {
                return interaction.reply({ content: "You don't have permission to use this button.", ephemeral: true });
            }
        }

        if (interaction.customId === 'create_channel') {
            if (userChannel) {
                return interaction.reply({ content: "You already own a channel.", ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('create_channel_modal')
                .setTitle('Create Your Channel');

            const nameInput = new TextInputBuilder()
                .setCustomId('channel_name_input')
                .setLabel('Channel Name')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(1)
                .setMaxLength(100);

            const actionRow = new ActionRowBuilder().addComponents(nameInput);
            modal.addComponents(actionRow);

            await interaction.showModal(modal);

        } else if (interaction.customId === 'rename_channel') {
            if (!userChannel || userChannel.userId !== interaction.user.id) {
                return interaction.reply({ content: "You don't own a channel.", ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('rename_channel_modal')
                .setTitle('Rename Your Channel');

            const nameInput = new TextInputBuilder()
                .setCustomId('new_channel_name_input')
                .setLabel('New Channel Name')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(1)
                .setMaxLength(100);

            const actionRow = new ActionRowBuilder().addComponents(nameInput);
            modal.addComponents(actionRow);

            await interaction.showModal(modal);

        } else if (interaction.customId === 'view_friends') {
            if (!userChannel || userChannel.userId !== interaction.user.id) {
                return interaction.reply({ content: "You don't own a channel.", ephemeral: true });
            }

            const friends = userChannel.friends;
            const friendsMentions = friends.map(friendId => `<@${friendId}>`).join('\n') || 'No friends added.';

            const embed = new EmbedBuilder()
                .setTitle(`Friends (${friends.length}/${calculateMaxFriends(interaction.member)})`)
                .setDescription(friendsMentions)
                .setColor(0x6666ff);

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    } catch (error) {
        console.error('Error in handleChannelButtons:', error);
        await interaction.reply({
            content: 'An error occurred while processing your request.',
            ephemeral: true
        });
    }
}

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

async function handleActivityButtons(interaction) {
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

    // Ask for confirmation to reset
    const confirmEmbed = new EmbedBuilder()
        .setTitle('Reset Weekly Tracking')
        .setDescription('Are you sure you want to reset the weekly tracking? This action cannot be undone.')
        .setColor(0xFF0000);

    const yesButton = new ButtonBuilder()
        .setCustomId('confirm_reset_yes')
        .setLabel('Yes')
        .setStyle(ButtonStyle.Danger);

    const noButton = new ButtonBuilder()
        .setCustomId('confirm_reset_no')
        .setLabel('No')
        .setStyle(ButtonStyle.Secondary);

    const confirmRow = new ActionRowBuilder().addComponents(yesButton, noButton);

    await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: true });

    // Define a collector to handle the confirmation response
    const filter = i => ['confirm_reset_yes', 'confirm_reset_no', 'assign_role_yes', 'assign_role_no'].includes(i.customId) && i.user.id === interaction.user.id;
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 15000 });

    collector.on('collect', async i => {
        if (i.customId === 'confirm_reset_yes') {
            // Save the current weekly data to a file before resetting
            const weeklyPath = './data/weekly.json';
            fs.writeFileSync(weeklyPath, JSON.stringify(activityData.weekly, null, 2));
            
            // Reset the weekly tracking
            activityData.weekly = {};

            fs.writeFileSync(activityLogsPath, JSON.stringify(activityData, null, 2));
            await updateEmbed(interaction, activityData.weekly);

            // Notify user about reset and ask if they want to assign the role
            const assignRoleEmbed = new EmbedBuilder()
                .setTitle('Assign Ultimate Staff Host Role')
                .setDescription('Do you want to assign the Ultimate Staff Host role to the top user?')
                .setColor(0x0099FF);

            const assignYesButton = new ButtonBuilder()
                .setCustomId('assign_role_yes')
                .setLabel('Yes')
                .setStyle(ButtonStyle.Primary);

            const assignNoButton = new ButtonBuilder()
                .setCustomId('assign_role_no')
                .setLabel('No')
                .setStyle(ButtonStyle.Secondary);

            const assignRoleRow = new ActionRowBuilder().addComponents(assignYesButton, assignNoButton);

            await i.update({ embeds: [assignRoleEmbed], components: [assignRoleRow], ephemeral: true });
        } else if (i.customId === 'confirm_reset_no') {
            await i.update({ content: 'Reset action has been canceled.', components: [], ephemeral: true });
        } else if (i.customId === 'assign_role_yes') {
            const weeklyPath = './data/weekly.json';
            const savedWeeklyData = JSON.parse(fs.readFileSync(weeklyPath, 'utf8'));
            const topUser = Object.entries(savedWeeklyData)
                .sort(([, a], [, b]) => b - a)[0];

            if (topUser) {
                const topUserId = topUser[0];
                const topMember = await interaction.guild.members.fetch(topUserId);
                if (topMember) {
                    await topMember.roles.add('713452411720827013');
                    await i.update({ content: 'Ultimate Staff Host role has been assigned to the top user!', components: [], ephemeral: true });
                } else {
                    await i.update({ content: 'Top user not found in the guild!', components: [], ephemeral: true });
                }
            } else {
                await i.update({ content: 'No top user found to assign the role to.', components: [], ephemeral: true });
            }
        } else if (i.customId === 'assign_role_no') {
            await i.update({ content: 'Ultimate Staff Host role assignment has been skipped.', components: [], ephemeral: true });
        }
    });
    break;

    }

    fs.writeFileSync(donoLogsPath, JSON.stringify(donoLogs, null, 2));
    fs.writeFileSync(activityLogsPath, JSON.stringify(activityData, null, 2));
    await updateEmbed(interaction, activityData.weekly);
}
async function handleModalSubmit(interaction) {
 if (interaction.customId === 'create_channel_modal' || interaction.customId === 'rename_channel_modal') {
            const channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

if (interaction.customId === 'create_channel_modal') {
    const channelName = interaction.fields.getTextInputValue('channel_name_input');
    
    if (!channelName || channelName.length < 1) {
        return await interaction.reply({ content: 'Please provide a valid channel name.', ephemeral: true });
    }

    const categoryIds = [
        '799997847931977749',
        '842471433238347786',
        '1064095644811284490'
    ];

    let channelCreated = false;
    let error = null;
    let channel = null;

    for (const categoryId of categoryIds) {
        try {
            const category = await interaction.guild.channels.fetch(categoryId);
            if (!category) continue;

            // Fetch all channels and properly count ones in this category
            const channels = await interaction.guild.channels.fetch();
            const channelsInCategory = channels.filter(ch => ch.parentId === categoryId);
            
            // Debug log to help identify issues
            console.log(`Category ${categoryId} has ${channelsInCategory.size} channels`);

            if (channelsInCategory.size >= 50) {
                console.log(`Category ${categoryId} is full, trying next category`);
                continue;
            }

            // Create the channel in this category
            channel = await interaction.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: categoryId,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        deny: ['ViewChannel'],
                    },
                    {
                        id: interaction.user.id,
                        allow: ['ViewChannel'],
                    }
                ]
            });

            channelCreated = true;
            break;
        } catch (e) {
            error = e;
            console.error(`Error creating channel in category ${categoryId}:`, e);
            continue;
        }
    }

    if (!channelCreated) {
        let errorMessage = 'Failed to create channel. ';
        if (error) {
            errorMessage += `Error: ${error.message}`;
        } else {
            errorMessage += 'All categories are either full or unavailable.';
        }
        return await interaction.reply({
            content: errorMessage,
            ephemeral: true
        });
    }

    channelsData[channel.id] = {
        channelId: channel.id,
        userId: interaction.user.id,
        friends: []
    };
    fs.writeFileSync(dataPath, JSON.stringify(channelsData, null, 2));
    
    await interaction.reply({
        content: `Channel ${channel} has been created successfully!`,
        ephemeral: true
    });


            } else if (interaction.customId === 'rename_channel_modal') {
                const newChannelName = interaction.fields.getTextInputValue('new_channel_name_input');
                
                if (!newChannelName || newChannelName.length < 1) {
                    return await interaction.reply({ content: 'Please provide a valid channel name.', ephemeral: true });
                }

                const userChannel = Object.values(channelsData).find(ch => ch.userId === interaction.user.id);
                if (!userChannel) {
                    return await interaction.reply({ content: 'You do not own a channel.', ephemeral: true });
                }

                const channel = interaction.guild.channels.cache.get(userChannel.channelId);
                if (!channel) {
                    return await interaction.reply({ content: 'Channel not found.', ephemeral: true });
                }

                await channel.setName(newChannelName);
                await interaction.reply({
                    content: `Channel has been renamed to ${channel}!`,
                    ephemeral: true
                });
            }
        }
  else if (interaction.customId === 'add_manual_modal' || interaction.customId === 'remove_manual_modal') {
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

    const yourRank = streakData.users.findIndex(user => user.userId === interaction.user.id) + 1 || 0;

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
            userMute.button_clicked = true;
        } else {
            const newDuration = remainingTime * 2;
            const newEndTime = currentTime + newDuration;
            responseMessage = `${interaction.user} took the risk and failed miserably. Mute duration is now doubled to **${Math.floor(newDuration)}** seconds.`;
            
            userMute.muteEndTime = newEndTime;
            userMute.button_clicked = true;
            
            setTimeout(async () => {
                try {
                    await interaction.member.roles.remove(mutedRole);
                    mutesData.users = mutesData.users.filter(mute => mute.userId !== interaction.user.id);
                    fs.writeFileSync(mutesPath, JSON.stringify(mutesData, null, 2));
                } catch (error) {
                    console.error('Error in unmute timeout:', error);
                }
            }, newDuration * 1000);
        }

        fs.writeFileSync(mutesPath, JSON.stringify(mutesData, null, 2));
        await interaction.followUp({ content: responseMessage });
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
