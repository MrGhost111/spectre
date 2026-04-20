// commands/removenote.js  (text command)
// Usage: !removenote <@user | userID> <amount> [note text]
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
    getCurrentMilestone,
    getNextMilestone,
} = require('../Donations/noteSystem');

module.exports = {
    name: 'removenote',
    description: 'Manually remove a donation amount from a user.',
    async execute(message, args) {
        // ── Permission check ──────────────────────────────────────────────────
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return;

        if (args.length < 2) {
            return message.reply('Usage: `!removenote <@user | userID> <amount> [note text]`');
        }

        // ── Resolve target ────────────────────────────────────────────────────
        const rawTarget = args[0].replace(/[<@!>]/g, '');
        if (!/^\d{17,19}$/.test(rawTarget)) {
            return message.reply('Please provide a valid user mention or ID.');
        }

        const targetMember = await message.guild.members.fetch(rawTarget).catch(() => null);
        if (!targetMember) {
            return message.reply(`Could not find a member with ID \`${rawTarget}\` in this server.`);
        }

        // ── Parse amount ──────────────────────────────────────────────────────
        const amount = parseAmount(args[1]);
        if (amount === null || amount <= 0) {
            return message.reply(
                `Could not parse \`${args[1]}\` as an amount. ` +
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

        const oldTotal      = data[rawTarget].totalDonated || 0;
        const actualRemoved = Math.min(amount, oldTotal);
        const newTotal      = Math.max(0, oldTotal - amount);

        // Capture old milestone BEFORE updating total
        const oldMilestone = getCurrentMilestone(oldTotal);

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

        // ── Full role update (can downgrade) ──────────────────────────────────
        await handleMilestoneRolesFull(targetMember, newTotal);
        const newMilestone  = getCurrentMilestone(newTotal);
        const nextMilestone = getNextMilestone(newTotal);

        const roleChanged = oldMilestone?.roleId !== newMilestone?.roleId;

        // ── Confirmation embed ────────────────────────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle('<:message:1000020218229305424>  Donation Removed')
            .setColor('#4c00b0')
            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User',       value: `<@${rawTarget}>`,                                                          inline: true },
                { name: '<:downvote:1303963004915679232> Removed', value: `⏣ ${formatFull(actualRemoved)}`,             inline: true },
                { name: '<:req:1000019378730975282> New Total',    value: `⏣ ${formatFull(newTotal)} *(${formatNumber(newTotal)})*`, inline: true },
                { name: 'Removed By', value: `<@${message.author.id}>`,                                                   inline: true },
            )
            .setTimestamp();

        if (actualRemoved < amount) {
            embed.addFields({
                name:   '<:purpledot:860074414853586984> Floored',
                value:  `Only ⏣ ${formatFull(actualRemoved)} could be removed — total cannot go below 0.`,
                inline: false,
            });
        }

        if (nextMilestone) {
            const needed = nextMilestone.amount - newTotal;
            embed.addFields({
                name:   '<:purpledot:860074414853586984> Next Milestone',
                value:  `<@&${nextMilestone.roleId}> — ⏣ ${formatFull(needed)} *(${formatNumber(needed)})* to go`,
                inline: false,
            });
        } else if (newTotal > 0) {
            embed.addFields({
                name:   '<:winners:1000018706874781806> Milestone',
                value:  'Max milestone reached!',
                inline: false,
            });
        }

        if (roleChanged) {
            const oldLabel = oldMilestone ? `<@&${oldMilestone.roleId}>` : 'None';
            const newLabel = newMilestone ? `<@&${newMilestone.roleId}>` : 'None';
            embed.addFields({
                name:   '<:downvote:1303963004915679232> Role Updated',
                value:  `${oldLabel} → ${newLabel}`,
                inline: false,
            });
        }

        if (noteText) {
            embed.addFields({
                name:   '<:message:1000020218229305424> Note Set',
                value:  noteText,
                inline: false,
            });
        }

        await message.reply({ embeds: [embed] });
    },
};
