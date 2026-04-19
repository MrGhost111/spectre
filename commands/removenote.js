// JavaScript source code
// slashCommands/removenote.js  (slash command)
// Usage: /removenote user:<@user>
// Requires Manage Guild permission.

const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { loadDonations, saveDonations, formatFull } = require('../Donations/noteSystem');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removenote')
        .setDescription('Remove a donation note from a user.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to remove the note from.')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        const targetUser = interaction.options.getUser('user');
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return interaction.editReply('Could not find that member in this server.');
        }

        // ── Read & update ─────────────────────────────────────────────────────
        const data = loadDonations();

        if (!data[targetUser.id] || !data[targetUser.id].note) {
            return interaction.editReply(`<@${targetUser.id}> doesn't have a note set.`);
        }

        const oldNote = data[targetUser.id].note;

        data[targetUser.id].note = null;
        data[targetUser.id].noteSetBy = null;
        data[targetUser.id].noteSetAt = null;

        saveDonations(data);

        // ── Confirmation embed ────────────────────────────────────────────────
        const total = data[targetUser.id].totalDonated || 0;

        const embed = new EmbedBuilder()
            .setTitle('🗑️  Note Removed')
            .setColor('#4c00b0')
            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User', value: `<@${targetUser.id}>`, inline: true },
                { name: 'Total Donated', value: `⏣ ${formatFull(total)}`, inline: true },
                { name: '\u200b', value: '\u200b', inline: true },
                { name: 'Removed Note', value: oldNote, inline: false },
                { name: 'Removed By', value: `<@${interaction.user.id}>`, inline: true },
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};