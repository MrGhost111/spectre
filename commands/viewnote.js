// slashCommands/viewnote.js
// Usage: /viewnote [user:<@user>]
// No permission restriction. Staff note only visible to Manage Guild members.

const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const {
    loadDonations,
    formatFull,
    formatNumber,
    getCurrentMilestone,
    getNextMilestone,
} = require('../Donations/noteSystem');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('viewnote')
        .setDescription('View donation profile for a user.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to view (defaults to yourself).')
                .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        const targetUser   = interaction.options.getUser('user') ?? interaction.user;
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
            return interaction.editReply('Could not find that member in this server.');
        }

        const data     = loadDonations();
        const userData = data[targetUser.id];
        const total    = userData?.totalDonated ?? 0;
        const note     = userData?.note ?? null;
        const history  = userData?.donations ?? [];

        const currentMilestone = getCurrentMilestone(total);
        const nextMilestone    = getNextMilestone(total);

        const embed = new EmbedBuilder()
            .setTitle(`<:prize:1000016483369369650>  Donation Profile — ${targetMember.displayName}`)
            .setColor('#4c00b0')
            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                {
                    name:   '💰 Total Donated',
                    value:  `⏣ ${formatFull(total)} *(${formatNumber(total)})*`,
                    inline: true,
                },
                {
                    name:   '<:purpledot:860074414853586984> Current Role',
                    value:  currentMilestone ? `<@&${currentMilestone.roleId}>` : 'None',
                    inline: true,
                },
            )
            .setTimestamp();

        if (nextMilestone) {
            const needed = nextMilestone.amount - total;
            embed.addFields({
                name:   '🎯 Next Milestone',
                value:  `<@&${nextMilestone.roleId}> — ⏣ ${formatFull(needed)} *(${formatNumber(needed)})* to go`,
                inline: false,
            });
        } else if (total > 0) {
            embed.addFields({ name: '🏆 Milestone', value: 'Max milestone reached!', inline: false });
        }

        // Last 5 entries
        const recent = [...history].reverse().slice(0, 5);
        if (recent.length > 0) {
            embed.addFields({
                name:   '📋 Recent Donations',
                value:  recent.map(d => {
                    const sign   = d.amount >= 0 ? '+' : '';
                    const date   = `<t:${Math.floor(new Date(d.timestamp).getTime() / 1000)}:d>`;
                    const manual = d.manual ? ' *(manual)*' : '';
                    return `${sign}⏣ ${formatFull(Math.abs(d.amount))}  ${date}${manual}`;
                }).join('\n'),
                inline: false,
            });
        } else {
            embed.addFields({ name: '📋 Recent Donations', value: 'No donations recorded yet.', inline: false });
        }

        // Staff note — only shown to Manage Guild members
        const isStaff = interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild);
        if (isStaff && note) {
            const setAt = userData.noteSetAt
                ? `<t:${Math.floor(new Date(userData.noteSetAt).getTime() / 1000)}:d>`
                : 'unknown';
            embed.addFields({
                name:   '📝 Staff Note',
                value:  `${note}\n*Set by <@${userData.noteSetBy}> on ${setAt}*`,
                inline: false,
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
