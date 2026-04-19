// JavaScript source code
// slashCommands/setnote.js  (slash command)
// Usage: /setnote user:<@user> note:<text>
// Requires Manage Guild permission.

const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { loadDonations, saveDonations, formatFull } = require('../Donations/noteSystem');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setnote')
        .setDescription('Set a donation note for a user.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to set a note for.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('note')
                .setDescription('The note to attach to this user.')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        const targetUser = interaction.options.getUser('user');
        const note = interaction.options.getString('note').trim();
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return interaction.editReply('Could not find that member in this server.');
        }

        // ── Write ─────────────────────────────────────────────────────────────
        const data = loadDonations();

        if (!data[targetUser.id]) {
            data[targetUser.id] = {
                note: null,
                noteSetBy: null,
                noteSetAt: null,
                totalDonated: 0,
                donations: [],
            };
        }

        data[targetUser.id].note = note;
        data[targetUser.id].noteSetBy = interaction.user.id;
        data[targetUser.id].noteSetAt = new Date().toISOString();

        saveDonations(data);

        // ── Confirmation embed ────────────────────────────────────────────────
        const total = data[targetUser.id].totalDonated || 0;

        const embed = new EmbedBuilder()
            .setTitle('📝  Note Set')
            .setColor('#4c00b0')
            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User', value: `<@${targetUser.id}>`, inline: true },
                { name: 'Total Donated', value: `⏣ ${formatFull(total)}`, inline: true },
                { name: '\u200b', value: '\u200b', inline: true },
                { name: 'Note', value: note, inline: false },
                { name: 'Set By', value: `<@${interaction.user.id}>`, inline: true },
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};