// commands/viewnote.js  (text command)
// Usage: !viewnote [<@user | userID>]
// No permission restriction. Staff note only shown to Manage Guild members.

const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const {
    loadDonations,
    formatFull,
    formatNumber,
    getCurrentMilestone,
    getNextMilestone,
} = require('../Donations/noteSystem');

module.exports = {
    name: 'viewnote',
    description: 'View donation profile for a user.',
    async execute(message, args) {
        // ── Resolve target ────────────────────────────────────────────────────
        let rawTarget = message.mentions.users.first()?.id ?? null;

        if (!rawTarget && args[0]) {
            const cleaned = args[0].replace(/[<@!>]/g, '');
            if (/^\d{17,19}$/.test(cleaned)) rawTarget = cleaned;
        }

        if (!rawTarget) rawTarget = message.author.id;

        const targetMember = await message.guild.members.fetch(rawTarget).catch(() => null);
        if (!targetMember) {
            return message.reply('Could not find that member in this server.');
        }

        const data     = loadDonations();
        const userData = data[rawTarget];
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
                    name:   '<:req:1000019378730975282> Total Donated',
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
                name:   '<:purpledot:860074414853586984> Next Milestone',
                value:  `<@&${nextMilestone.roleId}> — ⏣ ${formatFull(needed)} *(${formatNumber(needed)})* to go`,
                inline: false,
            });
        } else if (total > 0) {
            embed.addFields({ name: '<:winners:1000018706874781806> Milestone', value: 'Max milestone reached!', inline: false });
        }

        // Last 5 entries
        const recent = [...history].reverse().slice(0, 5);
        if (recent.length > 0) {
            embed.addFields({
                name:   '<:lbtest:1064919048242090054> Recent Donations',
                value:  recent.map(d => {
                    const sign   = d.amount >= 0 ? '+' : '';
                    const date   = `<t:${Math.floor(new Date(d.timestamp).getTime() / 1000)}:d>`;
                    const manual = d.manual ? ' *(manual)*' : '';
                    return `${sign}⏣ ${formatFull(Math.abs(d.amount))}  ${date}${manual}`;
                }).join('\n'),
                inline: false,
            });
        } else {
            embed.addFields({ name: '<:lbtest:1064919048242090054> Recent Donations', value: 'No donations recorded yet.', inline: false });
        }

        // Staff note — only shown to Manage Guild members
        const isStaff = message.member.permissions.has(PermissionsBitField.Flags.ManageGuild);
        if (isStaff && note) {
            const setAt = userData.noteSetAt
                ? `<t:${Math.floor(new Date(userData.noteSetAt).getTime() / 1000)}:d>`
                : 'unknown';
            embed.addFields({
                name:   '<:message:1000020218229305424> Staff Note',
                value:  `${note}\n*Set by <@${userData.noteSetBy}> on ${setAt}*`,
                inline: false,
            });
        }

        await message.reply({ embeds: [embed] });
    },
};
