const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, Colors } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../data/channels.json');

// Centralized role config (keep in sync with mychannel.js)
const ROLE_CONFIG = {
    '768448955804811274': { limit: 5 },
    '768449168297033769': { limit: 5 },
    '946729964328337408': { limit: 5 },
    '1028256286560763984': { limit: 5 },
    '1028256279124250624': { limit: 5 },
    '1038106794200932512': { limit: 5 },
    '783032959350734868': { limit: 10 },
    '1038888209440067604': { limit: 5, requiresRole: '783032959350734868' },
    '1349716423706148894': { limit: 5 },
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addfriends')
        .setDescription('Add friends to your channel')
        .addUserOption(option => option.setName('friend1').setDescription('First friend to add').setRequired(true))
        .addUserOption(option => option.setName('friend2').setDescription('Second friend to add'))
        .addUserOption(option => option.setName('friend3').setDescription('Third friend to add'))
        .addUserOption(option => option.setName('friend4').setDescription('Fourth friend to add'))
        .addUserOption(option => option.setName('friend5').setDescription('Fifth friend to add')),

    async execute(interaction) {
        const responses = [];

        let channelsData = {};
        if (fs.existsSync(dataPath)) {
            channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        }

        const userChannel = channelsData[interaction.user.id];
        if (!userChannel) {
            return interaction.reply({ content: "You don't own a channel.", ephemeral: true });
        }

        const channel = interaction.guild.channels.cache.get(userChannel.channelId);
        if (!channel) {
            return interaction.reply({ content: "Channel not found.", ephemeral: true });
        }

        const userOptions = [
            interaction.options.getUser('friend1'),
            interaction.options.getUser('friend2'),
            interaction.options.getUser('friend3'),
            interaction.options.getUser('friend4'),
            interaction.options.getUser('friend5'),
        ].filter(user => user !== null);

        const maxFriends = calculateMaxFriends(interaction.member);

        if (userChannel.friends.length + userOptions.length > maxFriends) {
            return interaction.reply({
                content: `You have exceeded your friend limit of ${maxFriends}.`,
                ephemeral: true,
            });
        }

        for (const user of userOptions) {
            if (user.bot) {
                responses.push(`You cannot add bots.`);
                continue;
            }
            if (interaction.user.id === user.id) {
                responses.push(`You cannot add yourself.`);
                continue;
            }

            if (!userChannel.friends) userChannel.friends = [];

            if (userChannel.friends.includes(user.id)) {
                // Already in list — just make sure the permission exists
                if (channel.permissionOverwrites.cache.has(user.id)) {
                    responses.push(`<@${user.id}> is already in the channel.`);
                } else {
                    try {
                        await channel.permissionOverwrites.create(user.id, {
                            [PermissionsBitField.Flags.ViewChannel]: true,
                        });
                        responses.push(`Added <@${user.id}>.`);
                    } catch (error) {
                        console.error('Error creating permission overwrite:', error);
                        responses.push(`Failed to add <@${user.id}>.`);
                    }
                }
            } else {
                userChannel.friends.push(user.id);
                try {
                    await channel.permissionOverwrites.create(user.id, {
                        [PermissionsBitField.Flags.ViewChannel]: true,
                    });
                    responses.push(`Added <@${user.id}>.`);
                } catch (error) {
                    console.error('Error creating permission overwrite:', error);
                    responses.push(`Failed to add <@${user.id}>.`);
                }
            }
        }

        // NOTE: Removed the "ensure all friends are in channel" loop that was here.
        // Friends who left and rejoined are handled in /mychannel instead.

        channelsData[interaction.user.id] = userChannel;
        fs.writeFileSync(dataPath, JSON.stringify(channelsData, null, 2), 'utf8');

        const embed = new EmbedBuilder()
            .setTitle('Add Friends')
            .setDescription(responses.length > 0 ? responses.join('\n') : 'No changes made.')
            .setColor(Colors.Green);

        await interaction.reply({ embeds: [embed] });
    },
};

function calculateMaxFriends(member) {
    let total = 0;
    for (const [roleId, config] of Object.entries(ROLE_CONFIG)) {
        if (member.roles.cache.has(roleId)) {
            if (config.requiresRole) {
                if (member.roles.cache.has(config.requiresRole)) total += config.limit;
            } else {
                total += config.limit;
            }
        }
    }
    return total;
}