// commands/removenote.js  (text command)
// Usage: !removenote <@user | userID> <amount> [note text]
// Requires Manage Guild permission.

const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const {
    loadDonations,
    saveDonations,
    formatFull,
    formatNumber,
    handleMilestoneRoles,
    getNextMilestone,
} = require('../Donations/noteSystem');

module.exports = {
    name: 'removenote',
    description: 'Manually remove a donation amount from a user.',
    async execute(message, args) {
        // ── Permission check ──────────────────────────────────────────────────
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return;

        // ── Argument validation ───────────────────────────────────────────────
        if (args.length < 2) {
            return message.reply('Usage: `!removenote <@user | userID> <amount> [note text]`');
        }

        const rawTarget = args[0].replace(/[<@!>]/g, '');
        if (!/^\d{17,19}$/.test(rawTarget)) {
            return message.reply('Please provide a valid user mention or ID.');
        }

        const targetMember = await message.guild.members.fetch(rawTarget).catch(() => null);
        if (!targetMember) {
            return message.reply(`Could not find a member with ID \`${rawTarget}\` in this server.`);
        }

        const rawAmount = args[1].replace(/,/g, '');
        const amount    = parseInt(rawAmount, 10);
        if (isNaN(amount) || amount <= 0) {
            return message.reply('Please provide a valid positive amount as the second argument.');
        }

        const noteText = args.length > 2 ? args.slice(2).join(' ').trim() : null;

        // ── Update data ───────────────────────────────────────────────────────
        const data = loadDonations();

        if (!data[rawTarget]) {
            data[rawTarget] = {
                note:         null,
                noteSetBy:    null,
                noteSetAt:    null,
                totalDonated: 0,
                donations:    [],
            };
        }

        const oldTotal      = data[rawTarget].totalDonated || 0;
        const actualRemoved = Math.min(amount, oldTotal);
        const newTotal      = Math.max(0, oldTotal - amount);

        data[rawTarget].totalDonated = newTotal;
        data[rawTarget].donations.push({
            amount:    -actualRemoved,
            timestamp:  new Date().toISOString(),
            removedBy:  message.author.id,
            manual:     true,
        });

        if (noteText) {
            data[rawTarget].note      = noteText;
            data[rawTarget].noteSetBy = message.author.id;
            data[rawTarget].noteSetAt = new Date().toISOString();
        }

        saveDonations(data);

        // ── Handle milestone roles (may downgrade if total dropped) ──────────
        const newRole       = await handleMilestoneRoles(targetMember, newTotal);
        const nextMilestone = getNextMilestone(newTotal);

        // ── Confirmation embed ────────────────────────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle('🗑️  Donation Removed')
            .setColor('#4c00b0')
            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User',       value: `<@${rawTarget}>`,                                        inline: true },
                { name: 'Removed',    value: `⏣ ${formatFull(actualRemoved)}`,                         inline: true },
                { name: 'New Total',  value: `⏣ ${formatFull(newTotal)}  *(${formatNumber(newTotal)})*`, inline: true },
                { name: 'Removed By', value: `<@${message.author.id}>`,                                 inline: true },
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
                value:  `<@${rawTarget}> is now at <@&${newRole.roleId}>`,
                inline: false,
            });
        }

        if (noteText) {
            embed.addFields({ name: '📝 Note Set', value: noteText, inline: false });
        }

        await message.reply({ embeds: [embed] });
    },
};
