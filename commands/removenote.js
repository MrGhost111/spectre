// slashCommands/removenote.js
// Usage: /removenote user:<@user> amount:<text> [note:<text>]
// Requires a staff role.
// Manually removes a donation amount from a user's total (floors at 0).
// Amount supports: 1k, 25m, 1.5b, 1bil, 1million, 1e6, 1,000,000, raw numbers.

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
        const amountRaw  = interaction.options.getString('amount');
        const noteText   = interaction.options.getString('note') ?? null;

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

        // ── Update data ───────────────────────────────────────────────────────
        const data = loadDonations();

        if (!data[targetUser.id]) {
            data[targetUser.id] = {
                note:         null,
                noteSetBy:    null,
                noteSetAt:    null,
                totalDonated: 0,
                donations:    [],
            };
        }

        const oldTotal      = data[targetUser.id].totalDonated || 0;
        const actualRemoved = Math.min(amount, oldTotal);
        const newTotal      = Math.max(0, oldTotal - amount);
        const oldMilestone  = getCurrentMilestone(oldTotal);

        data[targetUser.id].totalDonated = newTotal;
        data[targetUser.id].donations.push({
            amount:    -actualRemoved,
            timestamp:  new Date().toISOString(),
            removedBy:  interaction.user.id,
            manual:     true,
        });

        if (noteText !== null) {
            data[targetUser.id].note      = noteText;
            data[targetUser.id].noteSetBy = interaction.user.id;
            data[targetUser.id].noteSetAt = new Date().toISOString();
        }

        saveDonations(data);

        await handleMilestoneRolesFull(targetMember, newTotal);
        const newMilestone  = getCurrentMilestone(newTotal);
        const nextMilestone = getNextMilestone(newTotal);
        const roleChanged   = oldMilestone?.roleId !== newMilestone?.roleId;

        // ── Confirmation embed ────────────────────────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle('<:message:1000020218229305424>  Donation Removed')
            .setColor('#4c00b0')
            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User',                                                       value: `<@${targetUser.id}>`,                                                     inline: true },
                { name: '<:downvote:1303963004915679232> Removed',                    value: `⏣ ${formatFull(actualRemoved)}`,                                          inline: true },
                { name: '<:req:1000019378730975282> New Total',                       value: `⏣ ${formatFull(newTotal)} *(${formatNumber(newTotal)})*`,                  inline: true },
                { name: 'Removed By',                                                 value: `<@${interaction.user.id}>`,                                                inline: true },
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

        if (noteText !== null) {
            embed.addFields({
                name:   '<:message:1000020218229305424> Note Set',
                value:  noteText,
                inline: false,
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
