// JavaScript source code
// commands/setnote.js  (text command)
// Usage: !setnote <@user | userID> <note text>
// Requires Manage Guild permission.

const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { loadDonations, saveDonations, formatFull } = require('../Donations/noteSystem');

module.exports = {
    name: 'setnote',
    description: 'Set a donation note for a user.',

    async execute(message, args) {
        // ── Permission check ──────────────────────────────────────────────────
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return;

        // ── Argument validation ───────────────────────────────────────────────
        if (args.length < 2) {
            return message.reply('Usage: `!setnote <@user | userID> <note text>`');
        }

        const rawTarget = args[0].replace(/[<@!>]/g, '');
        if (!/^\d{17,19}$/.test(rawTarget)) {
            return message.reply('Please provide a valid user mention or ID as the first argument.');
        }

        const targetMember = await message.guild.members.fetch(rawTarget).catch(() => null);
        if (!targetMember) {
            return message.reply(`Could not find a member with ID \`${rawTarget}\` in this server.`);
        }

        const note = args.slice(1).join(' ').trim();
        if (!note) {
            return message.reply('Note text cannot be empty.');
        }

        // ── Write ─────────────────────────────────────────────────────────────
        const data = loadDonations();

        if (!data[rawTarget]) {
            data[rawTarget] = {
                note: null,
                noteSetBy: null,
                noteSetAt: null,
                totalDonated: 0,
                donations: [],
            };
        }

        data[rawTarget].note = note;
        data[rawTarget].noteSetBy = message.author.id;
        data[rawTarget].noteSetAt = new Date().toISOString();

        saveDonations(data);

        // ── Confirmation embed ────────────────────────────────────────────────
        const total = data[rawTarget].totalDonated || 0;

        const embed = new EmbedBuilder()
            .setTitle('📝  Note Set')
            .setColor('#4c00b0')
            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User', value: `<@${rawTarget}>`, inline: true },
                { name: 'Total Donated', value: `⏣ ${formatFull(total)}`, inline: true },
                { name: '\u200b', value: '\u200b', inline: true },
                { name: 'Note', value: note, inline: false },
                { name: 'Set By', value: `<@${message.author.id}>`, inline: true },
            )
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    },
};