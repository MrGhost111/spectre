// JavaScript source code
const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../../data/channels.json');

function calculateMaxFriends(member) {
    const roleLimits = {
        '768448955804811274': 5,
        '768449168297033769': 5,
        '946729964328337408': 5,
        '1028256286560763984': 5,
        '1028256279124250624': 5,
        '1038106794200932512': 5,
        '1038888209440067604': 5,
        '783032959350734868': 10,
        '1349716423706148894': 5,
    };

    let maxFriends = 0;
    for (const [roleId, limit] of Object.entries(roleLimits)) {
        if (member.roles.cache.has(roleId)) maxFriends += limit;
    }
    return maxFriends;
}

module.exports = async function handleChannelButtons(interaction) {
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
                return interaction.reply({ content: 'You already own a channel.', ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('create_channel_modal')
                .setTitle('Create Your Channel');

            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('channel_name_input')
                    .setLabel('Channel Name')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMinLength(1)
                    .setMaxLength(100)
            ));

            return interaction.showModal(modal);

        } else if (interaction.customId === 'rename_channel') {
            if (!userChannel) {
                return interaction.reply({ content: "You don't own a channel.", ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('rename_channel_modal')
                .setTitle('Rename Your Channel');

            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('new_channel_name_input')
                    .setLabel('New Channel Name')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMinLength(1)
                    .setMaxLength(100)
            ));

            return interaction.showModal(modal);

        } else if (interaction.customId === 'view_friends') {
            if (!userChannel) {
                return interaction.reply({ content: "You don't own a channel.", ephemeral: true });
            }

            const friends = userChannel.friends;
            const friendsMentions = friends.map(id => `<@${id}>`).join('\n') || 'No friends added.';

            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle(`Friends (${friends.length}/${calculateMaxFriends(interaction.member)})`)
                    .setDescription(friendsMentions)
                    .setColor(0x6666ff)],
                ephemeral: true
            });
        }
    } catch (error) {
        console.error('Error in handleChannelButtons:', error);
        await interaction.reply({ content: 'An error occurred while processing your request.', ephemeral: true });
    }
};