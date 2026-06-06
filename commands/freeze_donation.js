// slashCommands/freeze_donation.js

const {
    SlashCommandBuilder,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
} = require('discord.js');
const { loadDonations, saveDonations } = require('../Donations/noteSystem');

const STAFF_ROLE_IDS = [
    '712970141834674207',
    '806450472474116136',
    '710572344745132114',
    '746298070685188197',
    '1028276735357227029',
    '1487607589998166157',
];

const ACCENT_COLOR = 0x4c00b0;

function isStaffMember(member) {
    return STAFF_ROLE_IDS.some(id => member.roles.cache.has(id));
}

// Parse shorthand amounts like 1b, 500m, 2.5b etc.
function parseAmount(str) {
    if (!str) return null;
    const s = str.trim().toLowerCase().replace(/,/g, '');
    const match = s.match(/^([\d.]+)\s*(k|m|mil|b|bil|billion)?$/);
    if (!match) return null;
    const num = parseFloat(match[1]);
    const suffix = match[2] ?? '';
    const multipliers = { k: 1_000, m: 1_000_000, mil: 1_000_000, b: 1_000_000_000, bil: 1_000_000_000, billion: 1_000_000_000 };
    const result = suffix ? num * (multipliers[suffix] ?? 1) : num;
    return isNaN(result) ? null : Math.floor(result);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('freeze_donation')
        .setDescription('Freeze your donation notes — redirect future donations to another user.')
        .addStringOption(option =>
            option
                .setName('action')
                .setDescription('Enable or disable the donation freeze.')
                .setRequired(true)
                .addChoices(
                    { name: 'Enable', value: 'enable' },
                    { name: 'Disable', value: 'disable' },
                )
        )
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to transfer overflow donations to. Required when enabling.')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('amount')
                .setDescription('Freeze at this total (e.g. 100b). Leave blank to freeze immediately.')
                .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const action = interaction.options.getString('action');
        const targetUser = interaction.options.getUser('user');
        const amountRaw = interaction.options.getString('amount');
        const invoker = interaction.user;
        const member = interaction.member;

        // ── DISABLE ───────────────────────────────────────────────────────────
        if (action === 'disable') {
            const data = loadDonations('dankmemer');

            if (!data[invoker.id]?.freeze?.enabled) {
                return interaction.editReply({
                    content: '❌ You don\'t have a donation freeze active.',
                });
            }

            data[invoker.id].freeze = { enabled: false, transferTo: null, freezeAt: null };
            saveDonations(data, 'dankmemer'); // correct order: data first, event second

            return interaction.editReply({
                content: '✅ Donation freeze disabled. Your donations will be noted to your own account again.',
            });
        }

        // ── ENABLE ────────────────────────────────────────────────────────────
        if (!targetUser) {
            return interaction.editReply({
                content: '❌ You must specify a **user** to transfer donations to when enabling a freeze.',
            });
        }

        if (targetUser.id === invoker.id) {
            return interaction.editReply({ content: '❌ You can\'t transfer donations to yourself.' });
        }

        if (targetUser.bot) {
            return interaction.editReply({ content: '❌ You can\'t transfer donations to a bot.' });
        }

        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
            return interaction.editReply({ content: '❌ That user isn\'t in this server.' });
        }

        // ── Loop guard: reject if target already has freeze enabled ──────────
        const data = loadDonations('dankmemer');
        if (data[targetUser.id]?.freeze?.enabled) {
            return interaction.editReply({
                content: `❌ **${targetMember.displayName}** already has their own donation freeze active. Chaining freezes would cause an infinite loop — pick a different transfer target.`,
            });
        }

        // ── Parse optional freeze-at amount ───────────────────────────────────
        let freezeAt = null;
        if (amountRaw) {
            freezeAt = parseAmount(amountRaw);
            if (!freezeAt || freezeAt <= 0) {
                return interaction.editReply({
                    content: '❌ Invalid amount. Use formats like `100b`, `2.5b`, `500m`.',
                });
            }

            const currentTotal = data[invoker.id]?.totalDonated ?? 0;
            if (currentTotal >= freezeAt) {
                return interaction.editReply({
                    content: `❌ Your current donation total (⏣ ${currentTotal.toLocaleString()}) already exceeds or equals the freeze amount (⏣ ${freezeAt.toLocaleString()}). Choose a higher amount or leave blank to freeze immediately.`,
                });
            }
        }

        // ── Save freeze config — preserve all existing user data ──────────────
        if (!data[invoker.id]) {
            data[invoker.id] = { totalDonated: 0, donations: [], note: null };
        }

        data[invoker.id].freeze = {
            enabled: true,
            transferTo: targetUser.id,
            freezeAt: freezeAt ?? null,
        };

        saveDonations(data, 'dankmemer'); // correct order: data first, event second

        // ── Build confirmation ────────────────────────────────────────────────
        const currentTotal = data[invoker.id]?.totalDonated ?? 0;

        const lines = [
            `## <:prize:1000016483369369650> Donation Freeze Enabled`,
            `**Transfer To:** <@${targetUser.id}>`,
        ];

        if (freezeAt) {
            const remaining = freezeAt - currentTotal;
            lines.push(
                `**Freeze At:** ⏣ ${freezeAt.toLocaleString()}`,
                `**Current Total:** ⏣ ${currentTotal.toLocaleString()}`,
                `**Remaining before freeze:** ⏣ ${remaining.toLocaleString()}`,
                ``,
                `Once you hit ⏣ ${freezeAt.toLocaleString()}, all further donations will be redirected to <@${targetUser.id}>.`,
            );
        } else {
            lines.push(
                ``,
                `All future donations will be redirected to <@${targetUser.id}> immediately.`,
            );
        }

        const container = new ContainerBuilder().setAccentColor(ACCENT_COLOR);
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(lines.join('\n'))
        );

        return interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [] },
        });
    },
};