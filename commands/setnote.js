// slashCommands/setnote.js
// Usage: /setnote user:<@user> amount:<number> note:[optional text]
// Requires Manage Guild permission.
// Manually adds an amount to a user's donation total and updates milestone roles.

const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const {
    loadDonations,
    saveDonations,
    formatFull,
    formatNumber,
    handleMilestoneRoles,
    getNextMilestone,
} = require('../Donations/noteSystem');

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
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('The donation amount to add.')
                .setMinValue(1)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('note')
                .setDescription('Optional staff note to attach.')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        const targetUser   = interaction.options.getUser('user');
        const amount       = interaction.options.getInteger('amount');
        const noteText     = interaction.options.getString('note') ?? null;

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

        const oldTotal = data[targetUser.id].totalDonated || 0;
        data[targetUser.id].totalDonated = oldTotal + amount;
        data[targetUser.id].donations.push({
            amount,
            timestamp:  new Date().toISOString(),
            addedBy:    interaction.user.id,
            manual:     true,
        });

        if (noteText !== null) {
            data[targetUser.id].note      = noteText;
            data[targetUser.id].noteSetBy = interaction.user.id;
            data[targetUser.id].noteSetAt = new Date().toISOString();
        }

        saveDonations(data);

        const newTotal = data[targetUser.id].totalDonated;

        // ── Handle milestone roles ────────────────────────────────────────────
        const newRole       = await handleMilestoneRoles(targetMember, newTotal);
        const nextMilestone = getNextMilestone(newTotal);

        // ── Confirmation embed ────────────────────────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle('📝  Donation Added')
            .setColor('#4c00b0')
            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User',       value: `<@${targetUser.id}>`,                                       inline: true },
                { name: 'Added',      value: `⏣ ${formatFull(amount)}`,                                   inline: true },
                { name: 'New Total',  value: `⏣ ${formatFull(newTotal)}  *(${formatNumber(newTotal)})*`,  inline: true },
                { name: 'Added By',   value: `<@${interaction.user.id}>`,                                  inline: true },
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
                value:  `<@${targetUser.id}> has reached <@&${newRole.roleId}>`,
                inline: false,
            });
        }

        if (noteText !== null) {
            embed.addFields({ name: '📝 Note Set', value: noteText, inline: false });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
