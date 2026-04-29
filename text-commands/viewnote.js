// commands/viewnote.js  (text command)
// Usage: ,viewnote [<@user | userID>] [event]
// Event: dankmemer (default), investor, karuta, owo
// Anyone can use. Recent donations + staff note only visible to staff.

const { EmbedBuilder } = require('discord.js');
const {
    loadDonations,
    formatFull,
    formatNumber,
    getCurrentMilestone,
    getNextMilestone,
    EVENT_LABELS,
    EVENT_CURRENCY,
} = require('../Donations/noteSystem');

const STAFF_ROLE_IDS = [
    '712970141834674207', // Staff
    '806450472474116136', // Chat Mod
    '710572344745132114', // Mod
    '746298070685188197', // Admin
];

const VALID_EVENTS = ['dankmemer', 'investor', 'karuta', 'owo'];

function isStaffMember(member) {
    return STAFF_ROLE_IDS.some(id => member.roles.cache.has(id));
}

function fmtAmount(currency, amount) {
    return amount >= 1_000_000
        ? `${currency} ${formatFull(amount)} *(${formatNumber(amount)})*`
        : `${currency} ${formatFull(amount)}`;
}

module.exports = {
    name: 'viewnote',
    aliases: ['note', 'notes', 'vn'],
    description: 'View donation profile for a user.',

    async execute(message, args) {
        // ── Resolve target ────────────────────────────────────────────────────
        let rawTarget = message.mentions.users.first()?.id ?? null;
        let argOffset = 0;

        if (!rawTarget && args[0]) {
            const cleaned = args[0].replace(/[<@!>]/g, '');
            if (/^\d{17,19}$/.test(cleaned)) {
                rawTarget = cleaned;
                argOffset = 1;
            }
        } else if (rawTarget) {
            argOffset = 1;
        }

        if (!rawTarget) rawTarget = message.author.id;

        // ── Parse optional event ──────────────────────────────────────────────
        let event = 'dankmemer';
        if (args[argOffset] && VALID_EVENTS.includes(args[argOffset].toLowerCase())) {
            event = args[argOffset].toLowerCase();
        }

        const targetMember = await message.guild.members.fetch(rawTarget).catch(() => null);
        if (!targetMember) {
            return message.reply('Could not find that member in this server.');
        }

        const data = loadDonations(event);
        const userData = data[rawTarget];
        const total = userData?.totalDonated ?? 0;
        const note = userData?.note ?? null;
        const history = userData?.donations ?? [];

        const currentMilestone = getCurrentMilestone(total, event);
        const nextMilestone = getNextMilestone(total, event);
        const staff = isStaffMember(message.member);
        const currency = EVENT_CURRENCY[event];
        const eventLabel = EVENT_LABELS[event];
        const hasRoles = event !== 'owo';

        const embed = new EmbedBuilder()
            .setTitle(`<:prize:1000016483369369650>  ${eventLabel} Donations — ${targetMember.displayName}`)
            .setColor('#4c00b0')
            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
            .addFields({
                name: '<:req:1000019378730975282> Total Donated',
                value: fmtAmount(currency, total),
                inline: true,
            });

        if (hasRoles) {
            embed.addFields({
                name: '<:purpledot:860074414853586984> Current Role',
                value: currentMilestone ? `<@&${currentMilestone.roleId}>` : 'None',
                inline: true,
            });
        }

        embed.setTimestamp();

        if (hasRoles && nextMilestone) {
            const needed = nextMilestone.amount - total;
            embed.addFields({
                name: '<:purpledot:860074414853586984> Next Milestone',
                value: `<@&${nextMilestone.roleId}> — ${fmtAmount(currency, needed)} to go`,
                inline: false,
            });
        } else if (hasRoles && total > 0 && !nextMilestone) {
            embed.addFields({
                name: '<:winners:1000018706874781806> Milestone',
                value: 'Max milestone reached!',
                inline: false,
            });
        }

        if (staff) {
            const recent = [...history].reverse().slice(0, 5);
            if (recent.length > 0) {
                const guildId = message.guild.id;
                embed.addFields({
                    name: '<:lbtest:1064919048242090054> Recent Donations',
                    value: recent.map(d => {
                        const sign = d.amount >= 0 ? '+' : '-';
                        const date = `<t:${Math.floor(new Date(d.timestamp).getTime() / 1000)}:d>`;
                        const manual = d.manual ? ' *(manual)*' : '';
                        const amountStr = d.channelId && d.messageId
                            ? `[${sign}${currency} ${formatFull(Math.abs(d.amount))}](https://discord.com/channels/${guildId}/${d.channelId}/${d.messageId})`
                            : `${sign}${currency} ${formatFull(Math.abs(d.amount))}`;
                        return `${amountStr}  ${date}${manual}`;
                    }).join('\n'),
                    inline: false,
                });
            } else {
                embed.addFields({
                    name: '<:lbtest:1064919048242090054> Recent Donations',
                    value: 'No donations recorded yet.',
                    inline: false,
                });
            }

            if (note) {
                const setAt = userData.noteSetAt
                    ? `<t:${Math.floor(new Date(userData.noteSetAt).getTime() / 1000)}:d>`
                    : 'unknown';
                embed.addFields({
                    name: '<:message:1000020218229305424> Staff Note',
                    value: `${note}\n*Set by <@${userData.noteSetBy}> on ${setAt}*`,
                    inline: false,
                });
            }
        }

        await message.reply({ embeds: [embed] });
    },
};