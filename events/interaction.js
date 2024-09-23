const { ButtonStyle, ActionRowBuilder, ButtonBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionsBitField } = require('discord.js');
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
                const originalAuthorId = message.interaction.user.id; // The user who ran the original command

                if (interaction.user.id !== originalAuthorId) {
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
        } else if (interaction.isModalSubmit()) {
            await handleModalSubmit(interaction);
        }
    },
};

async function handleModalSubmit(interaction) {
    const dataPath = './data/channels.json';
    const channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    if (interaction.customId === 'create_channel_modal') {
        const channelName = interaction.fields.getTextInputValue('channel_name_input');

        const existingChannel = Object.values(channelsData).find(ch => ch.channelId && interaction.guild.channels.cache.get(ch.channelId));
        if (existingChannel) {
            delete channelsData[existingChannel.userId];
            fs.writeFileSync(dataPath, JSON.stringify(channelsData, null, 2));
        }

        const categoryId = '842471433238347786'; // Default category
        const category = interaction.guild.channels.cache.get(categoryId);

        let channel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category,
        });

        // Add channel owner with view permission using Discord.js v14 syntax
        await channel.permissionOverwrites.edit(interaction.user.id, {
            [PermissionsBitField.Flags.ViewChannel]: true,
        });

        channelsData[interaction.user.id] = {
            userId: interaction.user.id,
            channelId: channel.id,
            friends: [],
        };
        fs.writeFileSync(dataPath, JSON.stringify(channelsData, null, 2));

        await interaction.reply(`Channel <#${channel.id}> created successfully!`);
    } else if (interaction.customId === 'rename_channel_modal') {
        const newName = interaction.fields.getTextInputValue('new_channel_name_input');

        const userChannel = Object.values(channelsData).find(ch => ch.userId === interaction.user.id);
        if (!userChannel) {
            await interaction.reply({ content: "You don't own a channel.", ephemeral: true });
            return;
        }

        const channel = interaction.guild.channels.cache.get(userChannel.channelId);
        if (!channel) {
            await interaction.reply({ content: "Channel not found.", ephemeral: true });
            return;
        }

        await channel.setName(newName);
        await interaction.reply(`Channel name changed to **${newName}**`);
    }
}

// Helper function to calculate the maximum number of friends based on roles
function calculateMaxFriends(member) {
    const roleLimits = {
        '768448955804811274': 5, // Role ID 1
        '768449168297033769': 5, // Role ID 2
        '946729964328337408': 5, // Role ID 3
        '1028256286560763984': 2, // Role ID 4
        '1028256279124250624': 3, // Role ID 5
        '1038106794200932512': 5, // Role ID 6
    };

    let maxFriends = 0;

    for (const [roleId, limit] of Object.entries(roleLimits)) {
        if (member.roles.cache.has(roleId)) {
            maxFriends += limit;
        }
    }

    return maxFriends;
}
