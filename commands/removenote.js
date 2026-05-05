// slashCommands/removenote.js
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
    DONATION_LOG_CHANNEL_ID,
} = require('../Donations/noteSystem');

// ── Permissions ───────────────────────────────────────────────────────────────
const ROLE_EVENT_PERMISSIONS = {
    '746298070685188197': ['dankmemer', 'investor'],  // Admin
    '710572344745132114': ['dankmemer', 'investor'],  // Mod
    '806450472474116136': ['dankmemer', 'investor'],  // Chat Mod
    '712970141834674207': ['dankmemer', 'investor'],  // Staff
    '1028276735357227029': ['karuta'],                // Karuta Staff
    '1487607589998166157': ['owo'],                   // OwO Staff
};

function getAllowedEvents(member) {
    const allowed = new Set();
    for (const [roleId, events] of Object.entries(ROLE_EVENT_PERMISSIONS)) {
        if (member.roles.cache.has(roleId)) {
            events.forEach(e => allowed.add(e));
        }
    }
    return allowed;
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
            option.setName('user').setDescription('The user to remove the donation from.').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('amount').setDescription('Amount to remove. Supports: 1k, 25m, 1.5b, 1bil, 1e6, 1000000, etc.').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('event').setDescription('Which event to remove the donation from. Defaults to Dank Memer.').setRequired(false)
                .addChoices(
                    { name: 'Dank Memer', value: 'dankmemer' },
                    { name: 'Investor', value: 'investor' },
                    { name: 'Karuta', value: 'karuta' },
                    { name: 'OwO', value: 'owo' },
                )
        )
        .addStringOption(option =>
            option.setName('note').setDescription('Optional staff note to attach.').setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        const allowedEvents = getAllowedEvents(interaction.member);
        if (allowedEvents.size === 0) {
            return interaction.editReply('You do not have permission to use this command.');
        }

        const targetUser = interaction.options.getUser('user');
        const amountRaw = interaction.options.getString('amount');
        const event = interaction.options.getString('event') ?? 'dankmemer';
        const noteText = interaction.options.getString('note') ?? null;

        if (!allowedEvents.has(event)) {
            return interaction.editReply(
                `You do not have permission to edit **${EVENT_LABELS[event]}** donations. ` +
                `Your role only allows: ${[...allowedEvents].map(e => EVENT_LABELS[e]).join(', ')}.`
            );
        }

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
                noteChannelId: null,
                noteMessageId: null,
                totalDonated: 0,
                donations: [],
            };
        }

        const oldTotal = data[targetUser.id].totalDonated || 0;
        const oldRoleIds = getAllRolesUpTo(oldTotal, event).map(m => m.roleId);
        const actualRemoved = Math.min(amount, oldTotal);
        const newTotal = Math.max(0, oldTotal - amount);

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
            data[targetUser.id].noteChannelId = interaction.channelId;
            data[targetUser.id].noteMessageId = replyMessage?.id ?? null;
        }

        saveDonations(data, event);

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
            embed.addFields({ name: '<:winners:1000018706874781806> Milestone', value: 'Max milestone reached!', inline: false });
        }

        if (hasRoles && (gained.length > 0 || lost.length > 0)) {
            const lines = [];
            if (gained.length) lines.push(`**Gained:** ${gained.map(id => `<@&${id}>`).join(' ')}`);
            if (lost.length) lines.push(`**Lost:** ${lost.map(id => `<@&${id}>`).join(' ')}`);
            embed.addFields({ name: '<:downvote:1303963004915679232> Roles Updated', value: lines.join('\n'), inline: false });
        }

        if (noteText !== null) {
            embed.addFields({ name: '<:message:1000020218229305424> Note Set', value: noteText, inline: false });
        }

        await interaction.editReply({ embeds: [embed] });

        // ── Log to donation log channel ──────────────────────────────────────
        const logChannel = await interaction.client.channels.fetch(DONATION_LOG_CHANNEL_ID).catch(() => null);
        if (logChannel) {
            const jumpLink = replyMessage
                ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${replyMessage.id}`
                : null;

            const logEmbed = new EmbedBuilder()
                .setTitle('<:prize:1000016483369369650>  Donation Removed (Manual)')
                .setColor('#b00000')
                .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'Donor', value: `<@${targetUser.id}>`, inline: true },
                    { name: '<:downvote:1303963004915679232> Removed', value: fmtAmount(currency, actualRemoved), inline: true },
                    { name: '<:req:1000019378730975282> New Total', value: fmtAmount(currency, newTotal), inline: true },
                    { name: 'Removed By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '📋 Event', value: eventLabel, inline: true },
                )
                .setTimestamp();

            if (actualRemoved < amount) {
                logEmbed.addFields({
                    name: '<:purpledot:860074414853586984> Floored',
                    value: `Only ${fmtAmount(currency, actualRemoved)} could be removed — total cannot go below 0.`,
                    inline: false,
                });
            }

            if (hasRoles && nextMilestone) {
                const needed = nextMilestone.amount - newTotal;
                logEmbed.addFields({
                    name: '<:purpledot:860074414853586984> Next Milestone',
                    value: `<@&${nextMilestone.roleId}> — ${fmtAmount(currency, needed)} to go`,
                    inline: false,
                });
            } else if (hasRoles && newTotal > 0 && !nextMilestone) {
                logEmbed.addFields({ name: '<:winners:1000018706874781806> Milestone', value: 'Max milestone reached!', inline: false });
            }

            if (hasRoles && (gained.length > 0 || lost.length > 0)) {
                const lines = [];
                if (gained.length) lines.push(`**Gained:** ${gained.map(id => `<@&${id}>`).join(' ')}`);
                if (lost.length) lines.push(`**Lost:** ${lost.map(id => `<@&${id}>`).join(' ')}`);
                logEmbed.addFields({ name: '<:downvote:1303963004915679232> Roles Updated', value: lines.join('\n'), inline: false });
            }

            if (noteText !== null) {
                logEmbed.addFields({ name: '<:message:1000020218229305424> Note Set', value: noteText, inline: false });
            }

            if (jumpLink) {
                logEmbed.addFields({ name: '🔗 Source', value: `[Jump to command](${jumpLink})`, inline: false });
            }

            await logChannel.send({ embeds: [logEmbed] }).catch(e =>
                console.error('[removenote] Failed to send to log channel:', e)
            );
        }
    },
};