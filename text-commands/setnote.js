// commands/setnote.js  (text command)
// Usage: !setnote <@user | userID> <amount> [note text]
// Requires Manage Guild permission.
// Amount supports: 1k, 25m, 1.5b, 1bil, 1million, 1e6, 1,000,000, raw numbers.

const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const {
    loadDonations,
    saveDonations,
    parseAmount,
    formatFull,
    formatNumber,
    handleMilestoneRolesFull,
    getNextMilestone,
} = require('../Donations/noteSystem');

module.exports = {
    name: 'setnote',
    description: 'Manually add a donation amount to a user.',
    async execute(message, args) {
        // ── Permission check ──────────────────────────────────────────────────
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return;

        if (args.length < 2) {
            return message.reply('Usage: `!setnote <@user | userID> <amount> [note text]`');
        }

        // ── Resolve target ────────────────────────────────────────────────────
        const rawTarget = args[0].replace(/[<@!>]/g, '');
        if (!/^\d{17,19}$/.test(rawTarget)) {
            return message.reply('Please provide a valid user mention or ID as the first argument.');
        }

        const targetMember = await message.guild.members.fetch(rawTarget).catch(() => null);
        if (!targetMember) {
            return message.reply(`Could not find a member with ID \`${rawTarget}\` in this server.`);
        }

        // ── Parse amount ──────────────────────────────────────────────────────
        const amount = parseAmount(args[1]);
        if (amount === null || amount <= 0) {
            return message.reply(
                `❌ Could not parse \`${args[1]}\` as an amount. ` +
                `Try formats like: \`25m\`, \`1.5b\`, \`1bil\`, \`1e6\`, \`1000000\`.`
            );
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

        data[rawTarget].totalDonated = (data[rawTarget].totalDonated || 0) + amount;
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

        // ── Full role update ──────────────────────────────────────────────────
        const roleChange    = await handleMilestoneRolesFull(targetMember, newTotal);
        const nextMilestone = getNextMilestone(newTotal);

        // ── Confirmation embed ────────────────────────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle('📝  Donation Added')
            .setColor('#4c00b0')
            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User',      value: `<@${rawTarget}>`,                                        inline: true },
                { name: 'Added',     value: `⏣ ${formatFull(amount)}`,                                inline: true },
                { name: 'New Total', value: `⏣ ${formatFull(newTotal)} *(${formatNumber(newTotal)})*`, inline: true },
                { name: 'Added By',  value: `<@${message.author.id}>`,                                 inline: true },
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

        if (roleChange) {
            embed.addFields({
                name:   '🎉 Role Updated',
                value:  roleChange.roleId
                    ? `<@${rawTarget}> is now at <@&${roleChange.roleId}>`
                    : `All milestone roles removed (total below 1M).`,
                inline: false,
            });
        }

        if (noteText) {
            embed.addFields({ name: '📝 Note Set', value: noteText, inline: false });
        }

        await message.reply({ embeds: [embed] });
    },
};
