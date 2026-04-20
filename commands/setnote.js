// slashCommands/setnote.js
// Usage: /setnote user:<@user> amount:<text> [note:<text>]
// Requires Manage Guild permission.
// Manually adds a donation amount to a user's total and updates milestone roles.
// Amount supports: 1k, 25m, 1.5b, 1bil, 1million, 1e6, 1,000,000, raw numbers.

const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
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
                .setName('note')
                .setDescription('Optional staff note to attach.')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

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

        const oldTotal = data[targetUser.id].totalDonated || 0;

        // Capture old milestone BEFORE updating total
        const oldMilestone = getCurrentMilestone(oldTotal);

        data[targetUser.id].totalDonated = oldTotal + amount;
        data[targetUser.id].donations.push({
            amount,
            timestamp: new Date().toISOString(),
            addedBy:   interaction.user.id,
            manual:    true,
        });

        if (noteText !== null) {
            data[targetUser.id].note      = noteText;
            data[targetUser.id].noteSetBy = interaction.user.id;
            data[targetUser.id].noteSetAt = new Date().toISOString();
        }

        saveDonations(data);

        const newTotal = data[targetUser.id].totalDonated;

        // ── Full role update ──────────────────────────────────────────────────
        await handleMilestoneRolesFull(targetMember, newTotal);
        const newMilestone  = getCurrentMilestone(newTotal);
        const nextMilestone = getNextMilestone(newTotal);

        const roleChanged = oldMilestone?.roleId !== newMilestone?.roleId;

        // ── Confirmation embed ────────────────────────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle('<:message:1000020218229305424>  Donation Added')
            .setColor('#4c00b0')
            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User',      value: `<@${targetUser.id}>`,                                                    inline: true },
                { name: '<:upvote:1303963379945181224> Added',   value: `⏣ ${formatFull(amount)}`,                    inline: true },
                { name: '<:req:1000019378730975282> New Total',  value: `⏣ ${formatFull(newTotal)} *(${formatNumber(newTotal)})*`, inline: true },
                { name: 'Added By',  value: `<@${interaction.user.id}>`,                                               inline: true },
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
