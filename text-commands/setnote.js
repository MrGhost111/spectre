// commands/setnote.js  (text command)
// Usage: !setnote <@user | userID> <amount> [note text]
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
    name: 'setnote',
    description: 'Manually add a donation amount to a user.',
    async execute(message, args) {
        // ── Permission check ──────────────────────────────────────────────────
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return;

        // ── Argument validation ───────────────────────────────────────────────
        if (args.length < 2) {
            return message.reply('Usage: `!setnote <@user | userID> <amount> [note text]`');
        }

        const rawTarget = args[0].replace(/[<@!>]/g, '');
        if (!/^\d{17,19}$/.test(rawTarget)) {
            return message.reply('Please provide a valid user mention or ID as the first argument.');
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

        const oldTotal = data[rawTarget].totalDonated || 0;
        data[rawTarget].totalDonated = oldTotal + amount;
        data[rawTarget].donations.push({
            amount,
            timestamp: new Date().toISOString(),
            addedBy:   message.author.id,
            manual:    true,
        });

        if (noteText) {
            data[rawTarget].note      = noteText;
            data[rawTarget].noteSetBy = message.author.id;
            data[rawTarget].noteSetAt = new Date().toISOString();
        }

        saveDonations(data);

        const newTotal = data[rawTarget].totalDonated;

        // ── Handle milestone roles ────────────────────────────────────────────
        const newRole       = await handleMilestoneRoles(targetMember, newTotal);
        const nextMilestone = getNextMilestone(newTotal);

        // ── Confirmation embed ────────────────────────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle('📝  Donation Added')
            .setColor('#4c00b0')
            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User',      value: `<@${rawTarget}>`,                                        inline: true },
                { name: 'Added',     value: `⏣ ${formatFull(amount)}`,                                inline: true },
                { name: 'New Total', value: `⏣ ${formatFull(newTotal)}  *(${formatNumber(newTotal)})*`, inline: true },
                { name: 'Added By',  value: `<@${message.author.id}>`,                                inline: true },
            )
            .setTimestamp();

        if (nextMilestone) {
            const needed = nextMilestone.amount - newTotal;
            embed.addFields({
                name:   '🎯 Next Milestone',
                value:  `<@&${nextMilestone.roleId}> — ⏣ ${formatFull(needed)} *(${formatNumber(needed)})* to go`,
                inline: false,
            });
        } else {
            embed.addFields({ name: '🏆 Milestone', value: 'Max milestone reached!', inline: false });
        }

        if (newRole) {
            embed.addFields({
                name:   '🎉 Role Unlocked!',
                value:  `<@${rawTarget}> has reached <@&${newRole.roleId}>`,
                inline: false,
            });
        }

        if (noteText) {
            embed.addFields({ name: '📝 Note Set', value: noteText, inline: false });
        }

        await message.reply({ embeds: [embed] });
    },
};
