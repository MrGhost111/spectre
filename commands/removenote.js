// slashCommands/removenote.js
// Usage: /removenote user:<@user> amount:<number> note:[optional text]
// Requires Manage Guild permission.
// Manually removes a donation amount from a user's total (floors at 0).

const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const {
    loadDonations,
    saveDonations,
    formatFull,
    formatNumber,
    handleMilestoneRoles,
    getNextMilestone,
} = require('../Donations/noteSystem');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removenote')
        .setDescription('Manually remove a donation amount from a user.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to remove the donation from.')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('The donation amount to remove.')
                .setMinValue(1)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('note')
                .setDescription('Optional staff note to attach.')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        const targetUser   = interaction.options.getUser('user');
        const amount       = interaction.options.getInteger('amount');
        const noteText     = interaction.options.getString('note') ?? null;

        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
            return interaction.editReply('Could not find that member in this server.');
        }

        // ── Update data ───────────────────────────────────────────────────────
        const data = loadDonations();

        if (!data[targetUser.id]) {
            data[targetUser.id] = {
                note:         null,
                noteSetBy:    null,
                noteSetAt:    null,
                totalDonated: 0,
                donations:    [],
            };
        }

        const oldTotal   = data[targetUser.id].totalDonated || 0;
        const actualRemoved = Math.min(amount, oldTotal); // can't go below 0
        const newTotal   = Math.max(0, oldTotal - amount);

        data[targetUser.id].totalDonated = newTotal;
        data[targetUser.id].donations.push({
            amount:    -actualRemoved,
            timestamp:  new Date().toISOString(),
            removedBy:  interaction.user.id,
            manual:     true,
        });

        if (noteText !== null) {
            data[targetUser.id].note      = noteText;
            data[targetUser.id].noteSetBy = interaction.user.id;
            data[targetUser.id].noteSetAt = new Date().toISOString();
        }

        saveDonations(data);

        // ── Handle milestone roles (may remove roles if total dropped) ────────
        const newRole       = await handleMilestoneRoles(targetMember, newTotal);
        const nextMilestone = getNextMilestone(newTotal);

        // ── Confirmation embed ────────────────────────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle('🗑️  Donation Removed')
            .setColor('#4c00b0')
            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User',       value: `<@${targetUser.id}>`,                                       inline: true },
                { name: 'Removed',    value: `⏣ ${formatFull(actualRemoved)}`,                            inline: true },
                { name: 'New Total',  value: `⏣ ${formatFull(newTotal)}  *(${formatNumber(newTotal)})*`,  inline: true },
                { name: 'Removed By', value: `<@${interaction.user.id}>`,                                  inline: true },
            )
            .setTimestamp();

        if (actualRemoved < amount) {
            embed.addFields({
                name:   '⚠️ Note',
                value:  `Could only remove ⏣ ${formatFull(actualRemoved)} — total has been floored at 0.`,
                inline: false,
            });
        }

        if (nextMilestone) {
            const needed = nextMilestone.amount - newTotal;
            embed.addFields({
                name:   '🎯 Next Milestone',
                value:  `<@&${nextMilestone.roleId}> — ⏣ ${formatFull(needed)} *(${formatNumber(needed)})* to go`,
                inline: false,
            });
        } else if (newTotal > 0) {
            embed.addFields({ name: '🏆 Milestone', value: 'Max milestone reached!', inline: false });
        }

        if (newRole) {
            embed.addFields({
                name:   '🔄 Role Updated',
                value:  `<@${targetUser.id}> is now at <@&${newRole.roleId}>`,
                inline: false,
            });
        }

        if (noteText !== null) {
            embed.addFields({ name: '📝 Note Set', value: noteText, inline: false });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
