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
        if (interaction.isCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`Error executing command: ${error}`);
                await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
            }
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
            }
        }
    }
};

async function handleDeleteSnipe(interaction) {
    const message = interaction.message;
    
    // Find the original command message
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

    // Compare the interaction user with the original command user
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
async function handleChannelButtons(interaction) {
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
            await interaction.reply({ content: "You already own a channel.", ephemeral: true });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId('create_channel_modal')
            .setTitle('Create Your Channel');

        const nameInput = new TextInputBuilder()
            .setCustomId('channel_name_input')
            .setLabel('Channel Name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(nameInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    } else if (interaction.customId === 'rename_channel') {
        if (!userChannel || userChannel.userId !== interaction.user.id) {
            await interaction.reply({ content: "You don't own a channel.", ephemeral: true });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId('rename_channel_modal')
            .setTitle('Rename Your Channel');

        const nameInput = new TextInputBuilder()
            .setCustomId('new_channel_name_input')
            .setLabel('New Channel Name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(nameInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    } else if (interaction.customId === 'view_friends') {
        if (!userChannel || userChannel.userId !== interaction.user.id) {
            await interaction.reply({ content: "You don't own a channel.", ephemeral: true });
            return;
        }

        const friends = userChannel.friends;
        const friendsMentions = friends.map(friendId => `<@${friendId}>`).join('\n');
        const totalFriends = friends.length;

        const embed = new EmbedBuilder()
            .setTitle(`Friends (${totalFriends}/${calculateMaxFriends(interaction.member)})`)
            .setDescription(friendsMentions || 'No friends added.');

        await interaction.reply({ embeds: [embed], ephemeral: true });
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

        let riskData = { users: [] };
        let mutesData = {};
        try {
            riskData = JSON.parse(fs.readFileSync(riskPath, 'utf8'));
            mutesData = JSON.parse(fs.readFileSync(mutesPath, 'utf8'));
        } catch (error) {
            console.error(`Error reading data files: ${error}`);
            return await interaction.followUp({ content: 'An error occurred while processing your request.', ephemeral: true });
        }

        const userRiskData = riskData.users.find(user => user.userId === interaction.user.id);
        const currentTime = Date.now();

        if (userRiskData && (currentTime - userRiskData.timestamp) < 300000) {
            return await interaction.followUp({ content: 'stop spamming this wont help you', ephemeral: true });
        }

        if (userRiskData) {
            userRiskData.timestamp = currentTime;
        } else {
            riskData.users.push({ userId: interaction.user.id, timestamp: currentTime });
        }

        const success = Math.random() < 0.5;
        let responseMessage;

        if (success) {
            await interaction.member.roles.remove(mutedRole);
            responseMessage = `${interaction.user} took the risk and succeeded. They are no longer muted!`;

            if (mutesData[interaction.user.id]) {
                delete mutesData[interaction.user.id];
            }
        } else {
            const currentDuration = mutesData[interaction.user.id]?.duration || 35; // Default duration if not set
            const newDuration = currentDuration * 2;
            responseMessage = `${interaction.user} took the risk and failed miserably <:LOL:1016784080546832484>. Mute duration is now doubled to **${newDuration}** seconds.`;

            if (mutesData[interaction.user.id]) {
                mutesData[interaction.user.id].duration = newDuration;
            }
        }

        fs.writeFileSync(riskPath, JSON.stringify(riskData, null, 2));
        fs.writeFileSync(mutesPath, JSON.stringify(mutesData, null, 2));

        await interaction.followUp({ content: responseMessage }); // Non-ephemeral message for success/failure
    } catch (error) {
        if (error.code === 10062) {
            console.log('Interaction expired before response. Ignoring.');
        } else {
            console.error('Error in handleRiskButton:', error);
        }
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
