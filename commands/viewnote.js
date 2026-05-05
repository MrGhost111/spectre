// slashCommands/viewnote.js
const {
    SlashCommandBuilder,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
} = require('discord.js');
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
    '712970141834674207',
    '806450472474116136',
    '710572344745132114',
    '746298070685188197',
    '1028276735357227029',
    '1487607589998166157',
];

// Purple accent colour (0x4c00b0)
const ACCENT_COLOR = 0x4c00b0;

function isStaffMember(member) {
    return STAFF_ROLE_IDS.some(id => member.roles.cache.has(id));
}

function fmtAmount(currency, amount) {
    return `${currency} ${formatFull(amount)}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('viewnote')
        .setDescription('View donation profile for a user.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to view (defaults to yourself).')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('event')
                .setDescription('Which event to view. Defaults to Dank Memer.')
                .setRequired(false)
                .addChoices(
                    { name: 'Dank Memer', value: 'dankmemer' },
                    { name: 'Investor', value: 'investor' },
                    { name: 'Karuta', value: 'karuta' },
                    { name: 'OwO', value: 'owo' },
                )
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        // ── Resolve target ────────────────────────────────────────────────────
        const targetUser = interaction.options.getUser('user') ?? interaction.user;
        const event = interaction.options.getString('event') ?? 'dankmemer';
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return interaction.editReply({ content: 'Could not find that member in this server.' });
        }

        // ── Load data ─────────────────────────────────────────────────────────
        const data = loadDonations(event);
        const userData = data[targetUser.id];
        const total = userData?.totalDonated ?? 0;
        const note = userData?.note ?? null;
        const history = userData?.donations ?? [];
        const currentMilestone = getCurrentMilestone(total, event);
        const nextMilestone = getNextMilestone(total, event);
        const staff = isStaffMember(interaction.member);
        const currency = EVENT_CURRENCY[event];
        const eventLabel = EVENT_LABELS[event];
        const hasRoles = event !== 'owo';
        const guildId = interaction.guild.id;

        // ── Build container ───────────────────────────────────────────────────
        const container = new ContainerBuilder().setAccentColor(ACCENT_COLOR);

        // ── Section 1: avatar thumbnail + header info ─────────────────────────
        // \n\n between each block gives breathing room on mobile
        const headerParts = [
            `## <:prize:1000016483369369650>  ${eventLabel} Donations — ${targetMember.displayName}`,
            `**<:req:1000019378730975282> Total Donated:**\n${fmtAmount(currency, total)}`,
        ];

        if (hasRoles) {
            headerParts.push(
                `**<:edit:1064822995014651914> Current Role:**\n${currentMilestone ? `<@&${currentMilestone.roleId}>` : 'None'}`
            );
        }

        const headerSection = new SectionBuilder()
            .addTextDisplayComponents(
                // join with double newline so each block has a blank line above/below it
                new TextDisplayBuilder().setContent(headerParts.join('\n\n'))
            )
            .setThumbnailAccessory(
                new ThumbnailBuilder().setURL(
                    targetMember.user.displayAvatarURL({ dynamic: true })
                )
            );

        container.addSectionComponents(headerSection);

        // ── Separator ─────────────────────────────────────────────────────────
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        // ── Next milestone ────────────────────────────────────────────────────
        if (hasRoles) {
            if (nextMilestone) {
                const needed = nextMilestone.amount - total;
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `**<:edit:1064822995014651914> Next Milestone:**\n<@&${nextMilestone.roleId}> — ${fmtAmount(currency, needed)} to go`
                    )
                );
            } else if (total > 0) {
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `**<:winners:1000018706874781806> Milestone:** Max milestone reached!`
                    )
                );
            }

            container.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
            );
        }

        // ── Staff-only section ────────────────────────────────────────────────
        if (staff) {
            const recent = [...history].reverse().slice(0, 5);

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    '**<:lbtest:1064919048242090054> Recent Donations**'
                )
            );

            if (recent.length > 0) {
                const lines = recent.map(d => {
                    const sign = d.amount >= 0 ? '<:plus:1501036176944009366>' : '—';
                    const date = `<t:${Math.floor(new Date(d.timestamp).getTime() / 1000)}:d>`;
                    const manual = d.manual ? ' *(manual)*' : '';
                    const amountStr = `${currency} ${formatFull(Math.abs(d.amount))}`;

                    const itemDetail = (d.itemName && d.itemQty)
                        ? ` *(${d.itemQty} x ${d.itemName}${d.pricePerUnit ? `, ⏣ ${formatFull(d.pricePerUnit)} each` : ''})*`
                        : '';

                    const linkedAmount = (d.channelId && d.messageId)
                        ? `[${amountStr}](https://discord.com/channels/${guildId}/${d.channelId}/${d.messageId})`
                        : amountStr;

                    return `${date} ${sign} ${linkedAmount}${itemDetail}${manual}`;
                });

                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(lines.join('\n'))
                );
            } else {
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('No donations recorded yet.')
                );
            }

            // Staff note
            if (note) {
                container.addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                );

                const setAt = userData.noteSetAt
                    ? `<t:${Math.floor(new Date(userData.noteSetAt).getTime() / 1000)}:d>`
                    : 'unknown';

                const noteLink = (userData.noteChannelId && userData.noteMessageId)
                    ? `https://discord.com/channels/${guildId}/${userData.noteChannelId}/${userData.noteMessageId}`
                    : null;

                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `**<:message:1000020218229305424> Staff Note**\n` +
                        (noteLink ? `${setAt} [${note}](${noteLink})` : `${setAt} ${note}`)
                    )
                );
            }
        }

        // ── Send ──────────────────────────────────────────────────────────────
        await interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    },
};