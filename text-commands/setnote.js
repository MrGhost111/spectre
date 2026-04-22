// commands/setnote.js  (text command)
// Usage: !setnote <@user | userID> <amount> [note text]
// Requires a staff role.
// Amount supports: 1k, 25m, 1.5b, 1bil, 1million, 1e6, 1,000,000, raw numbers.

const { EmbedBuilder } = require('discord.js');
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

const STAFF_ROLE_IDS = [
    '712970141834674207', // Staff
    '806450472474116136', // Chat Mod
    '710572344745132114', // Mod
    '746298070685188197', // Admin
];

function isStaffMember(member) {
    return STAFF_ROLE_IDS.some(id => member.roles.cache.has(id));
}

module.exports = {

    name: 'setnote',
    aliases: ['sn','addnote'],
    description: 'Manually add a donation amount to a user.',
    async execute(message, args) {
        if (!isStaffMember(message.member)) return;

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

        const oldTotal     = data[rawTarget].totalDonated || 0;
        const oldMilestone = getCurrentMilestone(oldTotal);

        data[rawTarget].totalDonated = oldTotal + amount;
        data[rawTarget].donations.push({
            amount,
            timestamp: new Date().toISOString(),
            addedBy:   message.author.id,
            manual:    true,
            channelId: message.channel.id,
            messageId: message.id,
        });

        if (noteText) {
            data[rawTarget].note      = noteText;
            data[rawTarget].noteSetBy = message.author.id;
            data[rawTarget].noteSetAt = new Date().toISOString();
        }

        saveDonations(data);

        const newTotal = data[rawTarget].totalDonated;

        await handleMilestoneRolesFull(targetMember, newTotal);
        const newMilestone  = getCurrentMilestone(newTotal);
        const nextMilestone = getNextMilestone(newTotal);
        const roleChanged   = oldMilestone?.roleId !== newMilestone?.roleId;

        // ── Confirmation embed ────────────────────────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle('<:message:1000020218229305424>  Donation Added')
            .setColor('#4c00b0')
            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User',                                         value: `<@${rawTarget}>`,                                                     inline: true },
                { name: '<:upvote:1303963379945181224> Added',          value: `⏣ ${formatFull(amount)}`,                                             inline: true },
                { name: '<:req:1000019378730975282> New Total',         value: `⏣ ${formatFull(newTotal)} *(${formatNumber(newTotal)})*`,              inline: true },
                { name: 'Added By',                                     value: `<@${message.author.id}>`,                                             inline: true },
            )
            .setTimestamp();

        if (nextMilestone) {
            const needed = nextMilestone.amount - newTotal;
            embed.addFields({
                name:   '<:purpledot:860074414853586984> Next Milestone',
                value:  `<@&${nextMilestone.roleId}> — ⏣ ${formatFull(needed)} *(${formatNumber(needed)})* to go`,
                inline: false,
            });
        } else {
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
                name:   '<:upvote:1303963379945181224> Role Updated',
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
