// commands/setnote.js  (text command)
// Usage: ,setnote <@user | userID> <amount> [event] [note text]
// Event: dankmemer (default), investor, karuta, owo
// Requires a staff role.

const { EmbedBuilder } = require('discord.js');
const {
    loadDonations,
    saveDonations,
    parseAmount,
    formatFull,
    formatNumber,
    handleMilestoneRolesFull,
    getNextMilestone,
    getAllRolesUpTo,
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
    name: 'setnote',
    aliases: ['sn', 'addnote'],
    description: 'Manually add a donation amount to a user.',

    async execute(message, args) {
        if (!isStaffMember(message.member)) return;

        if (args.length < 2) {
            return message.reply('Usage: `,setnote <@user | userID> <amount> [event] [note text]`\nEvents: `dankmemer` (default), `investor`, `karuta`, `owo`');
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
                `Could not parse \`${args[1]}\` as an amount. ` +
                `Try formats like: \`25m\`, \`1.5b\`, \`1bil\`, \`1e6\`, \`1000000\`.`
            );
        }

        // ── Parse optional event (args[2]) ────────────────────────────────────
        let event = 'dankmemer';
        let noteStart = 2;
        if (args[2] && VALID_EVENTS.includes(args[2].toLowerCase())) {
            event = args[2].toLowerCase();
            noteStart = 3;
        }

        const noteText = args.length > noteStart ? args.slice(noteStart).join(' ').trim() : null;

        // ── Update data ───────────────────────────────────────────────────────
        const data = loadDonations(event);

        if (!data[rawTarget]) {
            data[rawTarget] = {
                note: null,
                noteSetBy: null,
                noteSetAt: null,
                totalDonated: 0,
                donations: [],
            };
        }

        const oldTotal = data[rawTarget].totalDonated || 0;
        const oldRoleIds = getAllRolesUpTo(oldTotal, event).map(m => m.roleId);

        data[rawTarget].totalDonated = oldTotal + amount;
        data[rawTarget].donations.push({
            amount,
            timestamp: new Date().toISOString(),
            addedBy: message.author.id,
            manual: true,
            channelId: message.channel.id,
            messageId: message.id,
        });

        if (noteText) {
            data[rawTarget].note = noteText;
            data[rawTarget].noteSetBy = message.author.id;
            data[rawTarget].noteSetAt = new Date().toISOString();
        }

        saveDonations(data, event);

        const newTotal = data[rawTarget].totalDonated;
        const hasRoles = event !== 'owo';
        const currency = EVENT_CURRENCY[event];
        const eventLabel = EVENT_LABELS[event];

        if (hasRoles) {
            await handleMilestoneRolesFull(targetMember, newTotal, event);
        }

        const newRoleIds = getAllRolesUpTo(newTotal, event).map(m => m.roleId);
        const nextMilestone = getNextMilestone(newTotal, event);
        const gained = newRoleIds.filter(id => !oldRoleIds.includes(id));
        const lost = oldRoleIds.filter(id => !newRoleIds.includes(id));

        // ── Confirmation embed ────────────────────────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle(`<:message:1000020218229305424>  Donation Added — ${eventLabel}`)
            .setColor('#4c00b0')
            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User', value: `<@${rawTarget}>`, inline: true },
                { name: '<:upvote:1303963379945181224> Added', value: fmtAmount(currency, amount), inline: true },
                { name: '<:req:1000019378730975282> New Total', value: fmtAmount(currency, newTotal), inline: true },
                { name: 'Added By', value: `<@${message.author.id}>`, inline: true },
            )
            .setTimestamp();

        if (hasRoles && nextMilestone) {
            const needed = nextMilestone.amount - newTotal;
            embed.addFields({
                name: '<:purpledot:860074414853586984> Next Milestone',
                value: `<@&${nextMilestone.roleId}> — ${fmtAmount(currency, needed)} to go`,
                inline: false,
            });
        } else if (hasRoles && !nextMilestone && newTotal > 0) {
            embed.addFields({
                name: '<:winners:1000018706874781806> Milestone',
                value: 'Max milestone reached!',
                inline: false,
            });
        }

        if (hasRoles && (gained.length > 0 || lost.length > 0)) {
            const lines = [];
            if (gained.length) lines.push(`**Gained:** ${gained.map(id => `<@&${id}>`).join(' ')}`);
            if (lost.length) lines.push(`**Lost:** ${lost.map(id => `<@&${id}>`).join(' ')}`);
            embed.addFields({
                name: '<:upvote:1303963379945181224> Roles Updated',
                value: lines.join('\n'),
                inline: false,
            });
        }

        if (noteText) {
            embed.addFields({
                name: '<:message:1000020218229305424> Note Set',
                value: noteText,
                inline: false,
            });
        }

        await message.reply({ embeds: [embed] });
    },
};