// slashCommands/removenote.js
// Usage: /removenote user:<@user> amount:<text> [event:<choice>] [note:<text>]
// Requires a staff role.
// Manually removes a donation amount from a user's total for the chosen event
// (floors at 0) and updates that event's milestone roles.

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
    loadDonations,
    saveDonations,
    parseAmount,
    formatFull,
    formatNumber,
    handleMilestoneRolesFull,
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

function isStaffMember(member) {
    return STAFF_ROLE_IDS.some(id => member.roles.cache.has(id));
}

function fmtAmount(currency, amount) {
    return amount >= 1_000_000
        ? `${currency} ${formatFull(amount)} *(${formatNumber(amount)})*`
        : `${currency} ${formatFull(amount)}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removenote')
        .setDescription('Manually remove a donation amount from a user.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to remove the donation from.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('amount')
                .setDescription('Amount to remove. Supports: 1k, 25m, 1.5b, 1bil, 1e6, 1000000, etc.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('event')
                .setDescription('Which event to remove the donation from. Defaults to Dank Memer.')
                .setRequired(false)
                .addChoices(
                    { name: 'Dank Memer', value: 'dankmemer' },
                    { name: 'Investor', value: 'investor' },
                    { name: 'Karuta', value: 'karuta' },
                    { name: 'OwO', value: 'owo' },
                )
        )
        .addStringOption(option =>
            option
                .setName('note')
                .setDescription('Optional staff note to attach.')
                .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        if (!isStaffMember(interaction.member)) {
            return interaction.editReply('You do not have permission to use this command.');
        }

        const targetUser = interaction.options.getUser('user');
        const amountRaw = interaction.options.getString('amount');
        const event = interaction.options.getString('event') ?? 'dankmemer';
        const noteText = interaction.options.getString('note') ?? null;

        const amount = parseAmount(amountRaw);
        if (amount === null || amount <= 0) {
            return interaction.editReply(
                `Could not parse \`${amountRaw}\` as an amount. ` +
                `Try formats like: \`25m\`, \`1.5b\`, \`1bil\`, \`1e6\`, \`1000000\`.`
            );
        }

        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
            return interaction.editReply('Could not find that member in this server.');
        }

        // ── Update data ──────────────────────────────────────────────────────
        const data = loadDonations(event);

        if (!data[targetUser.id]) {
            data[targetUser.id] = {
                note: null,
                noteSetBy: null,
                noteSetAt: null,
                totalDonated: 0,
                donations: [],
            };
        }

        const oldTotal = data[targetUser.id].totalDonated || 0;
        const actualRemoved = Math.min(amount, oldTotal);
        const newTotal = Math.max(0, oldTotal - amount);
        const oldMilestone = getCurrentMilestone(oldTotal, event);

        data[targetUser.id].totalDonated = newTotal;

        const replyMessage = await interaction.fetchReply().catch(() => null);

        data[targetUser.id].donations.push({
            amount: -actualRemoved,
            timestamp: new Date().toISOString(),
            removedBy: interaction.user.id,
            manual: true,
            channelId: interaction.channelId,
            messageId: replyMessage?.id ?? null,
        });

        if (noteText !== null) {
            data[targetUser.id].note = noteText;
            data[targetUser.id].noteSetBy = interaction.user.id;
            data[targetUser.id].noteSetAt = new Date().toISOString();
        }

        saveDonations(data, event);

        const hasRoles = event !== 'owo';
        const currency = EVENT_CURRENCY[event];
        const eventLabel = EVENT_LABELS[event];

        if (hasRoles) {
            await handleMilestoneRolesFull(targetMember, newTotal, event);
        }

        const newMilestone = getCurrentMilestone(newTotal, event);
        const nextMilestone = getNextMilestone(newTotal, event);
        const roleChanged = oldMilestone?.roleId !== newMilestone?.roleId;

        // ── Confirmation embed ───────────────────────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle(`<:message:1000020218229305424>  Donation Removed — ${eventLabel}`)
            .setColor('#4c00b0')
            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User', value: `<@${targetUser.id}>`, inline: true },
                { name: '<:downvote:1303963004915679232> Removed', value: fmtAmount(currency, actualRemoved), inline: true },
                { name: '<:req:1000019378730975282> New Total', value: fmtAmount(currency, newTotal), inline: true },
                { name: 'Removed By', value: `<@${interaction.user.id}>`, inline: true },
            )
            .setTimestamp();

        if (actualRemoved < amount) {
            embed.addFields({
                name: '<:purpledot:860074414853586984> Floored',
                value: `Only ${fmtAmount(currency, actualRemoved)} could be removed — total cannot go below 0.`,
                inline: false,
            });
        }

        if (hasRoles && nextMilestone) {
            const needed = nextMilestone.amount - newTotal;
            embed.addFields({
                name: '<:purpledot:860074414853586984> Next Milestone',
                value: `<@&${nextMilestone.roleId}> — ${fmtAmount(currency, needed)} to go`,
                inline: false,
            });
        } else if (hasRoles && newTotal > 0 && !nextMilestone) {
            embed.addFields({
                name: '<:winners:1000018706874781806> Milestone',
                value: 'Max milestone reached!',
                inline: false,
            });
        }

        if (hasRoles && roleChanged) {
            const oldLabel = oldMilestone ? `<@&${oldMilestone.roleId}>` : 'None';
            const newLabel = newMilestone ? `<@&${newMilestone.roleId}>` : 'None';
            embed.addFields({
                name: '<:downvote:1303963004915679232> Role Updated',
                value: `${oldLabel} → ${newLabel}`,
                inline: false,
            });
        }

        if (noteText !== null) {
            embed.addFields({
                name: '<:message:1000020218229305424> Note Set',
                value: noteText,
                inline: false,
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};