// JavaScript source code
// commands/removenote.js  (text command)
// Usage: !removenote <@user | userID>
// Requires Manage Guild permission.

const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { loadDonations, saveDonations, formatFull } = require('../Donations/noteSystem');

module.exports = {
    name: 'removenote',
    description: 'Remove a donation note from a user.',

    async execute(message, args) {
        // ── Permission check ──────────────────────────────────────────────────
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return;

        // ── Argument validation ───────────────────────────────────────────────
        if (!args[0]) {
            return message.reply('Usage: `!removenote <@user | userID>`');
        }

        const rawTarget = args[0].replace(/[<@!>]/g, '');
        if (!/^\d{17,19}$/.test(rawTarget)) {
            return message.reply('Please provide a valid user mention or ID.');
        }

        const targetMember = await message.guild.members.fetch(rawTarget).catch(() => null);
        if (!targetMember) {
            return message.reply(`Could not find a member with ID \`${rawTarget}\` in this server.`);
        }

        // ── Read & update ─────────────────────────────────────────────────────
        const data = loadDonations();

        if (!data[rawTarget] || !data[rawTarget].note) {
            return message.reply(`<@${rawTarget}> doesn't have a note set.`);
        }

        const oldNote = data[rawTarget].note;

        data[rawTarget].note = null;
        data[rawTarget].noteSetBy = null;
        data[rawTarget].noteSetAt = null;

        saveDonations(data);

        // ── Confirmation embed ────────────────────────────────────────────────
        const total = data[rawTarget].totalDonated || 0;

        const embed = new EmbedBuilder()
            .setTitle('🗑️  Note Removed')
            .setColor('#4c00b0')
            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User', value: `<@${rawTarget}>`, inline: true },
                { name: 'Total Donated', value: `⏣ ${formatFull(total)}`, inline: true },
                { name: '\u200b', value: '\u200b', inline: true },
                { name: 'Removed Note', value: oldNote, inline: false },
                { name: 'Removed By', value: `<@${message.author.id}>`, inline: true },
            )
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    },
};