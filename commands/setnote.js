// slashCommands/setnote.js
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
        .setName('setnote')
        .setDescription('Manually add a donation amount to a user.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to add the donation for.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('amount')
                .setDescription('Amount to add. Supports: 1k, 25m, 1.5b, 1bil, 1e6, 1000000, etc.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('event')
                .setDescription('Which event to add the donation for. Defaults to Dank Memer.')
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
        const oldRoleIds = getAllRolesUpTo(oldTotal, event).map(m => m.roleId);

        data[targetUser.id].totalDonated = oldTotal + amount;

        const replyMessage = await interaction.fetchReply().catch(() => null);

        data[targetUser.id].donations.push({
            amount,
            timestamp: new Date().toISOString(),
            addedBy: interaction.user.id,
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

        const newTotal = data[targetUser.id].totalDonated;
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

        // ── Confirmation embed ───────────────────────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle(`<:message:1000020218229305424>  Donation Added — ${eventLabel}`)
            .setColor('#4c00b0')
            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User', value: `<@${targetUser.id}>`, inline: true },
                { name: '<:upvote:1303963379945181224> Added', value: fmtAmount(currency, amount), inline: true },
                { name: '<:req:1000019378730975282> New Total', value: fmtAmount(currency, newTotal), inline: true },
                { name: 'Added By', value: `<@${interaction.user.id}>`, inline: true },
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