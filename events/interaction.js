const { ButtonStyle, ActionRowBuilder, ButtonBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const path = require('path');
const fs = require('fs');

// Importing the mychannel command
const myChannelCommand = require(path.join(__dirname, '../commands/myc.js'));
const dataPath = './data/channels.json';

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
            console.log(`Button Interaction Detected: ${interaction.customId}`); // Debugging log

            // Check if it's the delete_snipe or delete_esnipe button
            if (interaction.customId === 'delete_snipe' || interaction.customId === 'delete_esnipe') {
                const message = interaction.message;
                const originalAuthorId = message.interaction?.user?.id; // Added safe navigation to prevent null errors

                if (!originalAuthorId || interaction.user.id !== originalAuthorId) {
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

                    const originalCommandMessage = await interaction.channel.messages.fetch({ limit: 100 }).then(messages => {
                        return messages.find(msg => 
                            msg.content.startsWith(',snipe') || 
                            msg.content.startsWith(',esnipe')
                        );
                    });

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

            // Add handling for buttons related to mychannel command
            else if (interaction.customId === 'create_channel' || interaction.customId === 'rename_channel' || interaction.customId === 'view_friends') {
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
                }


 else if (interaction.customId === 'rename_channel') {
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
// New interaction handler for the 'lb' button
else if (interaction.customId === 'lb') {
    // Load the streaks from the JSON file
    const streaksPath = './data/streaks.json';
    let streaks = {};

    try {
        const data = fs.readFileSync(streaksPath, 'utf8');
        streaks = JSON.parse(data);
    } catch (error) {
        console.error(`Error reading streaks file: ${error}`);
        return await interaction.reply({ content: 'Failed to load leaderboard data.', ephemeral: true });
    }

    // Sort streaks and prepare the leaderboard
    const sortedStreaks = Object.entries(streaks)
        .sort(([, a], [, b]) => b - a) // Sort in descending order
        .slice(0, 5); // Get top 5

    const leaderboardEntries = sortedStreaks.map(([userId, streak], index) => {
        const rankEmojis = [
            '<:One:1043063155653357568>',
            '<:Two:1043063239493300294>',
            '<:Three:1043063324423757885>',
            '<:Four:1043085748796129301>',
            '<:Five:1043085910432030760>'
        ];
        
        const rankEmoji = rankEmojis[index] || '';
        const userTag = `${interaction.client.users.cache.get(userId)?.tag || 'Unknown User'}`;

        // Check if the interaction author is in the leaderboard
        const userEmoji = interaction.user.id === userId ? '<:sweg:1010054002202906634>' : '';
        
        return `${rankEmoji} ┊ ${userTag} - ${streak} ${userEmoji}`;
    });

    const yourRank = sortedStreaks.findIndex(([userId]) => userId === interaction.user.id) + 1 || 0;

    // Create the embed for the leaderboard
    const lbEmbed = new EmbedBuilder()
        .setTitle('Leaderboard: Streak')
        .setColor(0x00FFFF) // Change to cyan color
        .setDescription(leaderboardEntries.join('\n') || 'No streaks available.')
        .setFooter({ text: `Your rank: ${yourRank}` });

    await interaction.reply({ embeds: [lbEmbed], ephemeral: true });
}


            // New interaction handler for the 'info' button
            else if (interaction.customId === 'info') {
                // Retrieve member roles from the interaction
                const memberRoles = interaction.member.roles.cache;

                // Base roles and corresponding luck values
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
                    '1030707878597763103': 60, 
                    '1028256286560763984': 65
                };

                // Booster roles
                const boosterRoles = {
                    '721331975847411754': 5,  // Booster 1
                    '721020858818232343': 5,  // Booster 2
                    '713452411720827013': 5   // Booster 3
                };
                let luck = 0;
                let highestBaseRole = null;
                let boosterLuck = 0;
                let contributingRoles = [];

                // Calculate luck for each base role individually
                for (const [roleId, luckValue] of Object.entries(baseRoles)) {
                    if (memberRoles.has(roleId)) {
                        if (luckValue > luck) {
                            luck = luckValue;
                            highestBaseRole = `<@&${roleId}> (Base Luck: ${luckValue}%)`;
                        }
                    }
                }

                // Collect all booster luck
                for (const [roleId, boostValue] of Object.entries(boosterRoles)) {
                    if (memberRoles.has(roleId)) {
                        boosterLuck += boostValue;
                        contributingRoles.push(`<@&${roleId}> (Booster Luck: +${boostValue}%)`);
                    }
                }

                // Calculate total luck, ensuring it doesn't exceed 100
                const totalLuck = Math.min(luck + boosterLuck, 100);

                // If no base roles are found, show that
                if (!highestBaseRole) {
                    contributingRoles.push('No base luck roles assigned.');
                }

                // Create an embed with all information
                const luckEmbed = new EmbedBuilder()
                    .setTitle('Luck Information')
                    .setColor(0x00FF00) // Green color for the embed
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
        }
    }
};

function calculateMaxFriends(member) {
    // Logic for calculating maximum friends based on the member's roles
    // This could vary based on your specific requirements
    return 10; // Placeholder value, adjust as needed
}
