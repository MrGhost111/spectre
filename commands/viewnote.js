// slashCommands/viewnote.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
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
        .setName('viewnote')
        .setDescription('View donation profile for a user.')
        .addUserOption(option =>
            option.setName('user').setDescription('User to view (defaults to yourself).').setRequired(false)
        )
        .addStringOption(option =>
            option.setName('event').setDescription('Which event to view. Defaults to Dank Memer.').setRequired(false)
                .addChoices(
                    { name: 'Dank Memer', value: 'dankmemer' },
                    { name: 'Investor', value: 'investor' },
                    { name: 'Karuta', value: 'karuta' },
                    { name: 'OwO', value: 'owo' },
                )
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        const targetUser = interaction.options.getUser('user') ?? interaction.user;
        const event = interaction.options.getString('event') ?? 'dankmemer';
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) return interaction.editReply('Could not find that member in this server.');

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

        const embed = new EmbedBuilder()
            .setTitle(`<:prize:1000016483369369650>  ${eventLabel} Donations — ${targetMember.displayName}`)
            .setColor('#4c00b0')
            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
            .addFields({
                name: '<:req:1000019378730975282> Total Donated',
                value: fmtAmount(currency, total),
                inline: true,
            });

        if (hasRoles) {
            embed.addFields({
                name: '<:purpledot:860074414853586984> Current Role',
                value: currentMilestone ? `<@&${currentMilestone.roleId}>` : 'None',
                inline: true,
            });
        }

        embed.setTimestamp();

        if (hasRoles && nextMilestone) {
            const needed = nextMilestone.amount - total;
            embed.addFields({
                name: '<:purpledot:860074414853586984> Next Milestone',
                value: `<@&${nextMilestone.roleId}> — ${fmtAmount(currency, needed)} to go`,
                inline: false,
            });
        } else if (hasRoles && total > 0 && !nextMilestone) {
            embed.addFields({
                name: '<:winners:1000018706874781806> Milestone',
                value: 'Max milestone reached!',
                inline: false,
            });
        }

        if (staff) {
            const recent = [...history].reverse().slice(0, 5);
            if (recent.length > 0) {
                const guildId = interaction.guild.id;
                embed.addFields({
                    name: '<:lbtest:1064919048242090054> Recent Donations',
                    value: recent.map(d => {
                        const sign = d.amount >= 0 ? '+' : '-';
                        const date = `<t:${Math.floor(new Date(d.timestamp).getTime() / 1000)}:d>`;
                        const manual = d.manual ? ' *(manual)*' : '';
                        const amountStr = d.channelId && d.messageId
                            ? `[${sign}${currency} ${formatFull(Math.abs(d.amount))}](https://discord.com/channels/${guildId}/${d.channelId}/${d.messageId})`
                            : `${sign}${currency} ${formatFull(Math.abs(d.amount))}`;
                        return `${amountStr}  ${date}${manual}`;
                    }).join('\n'),
                    inline: false,
                });
            } else {
                embed.addFields({
                    name: '<:lbtest:1064919048242090054> Recent Donations',
                    value: 'No donations recorded yet.',
                    inline: false,
                });
            }

            if (note) {
                const setAt = userData.noteSetAt
                    ? `<t:${Math.floor(new Date(userData.noteSetAt).getTime() / 1000)}:d>`
                    : 'unknown';

                const guildId = interaction.guild.id;
                const noteLink = (userData.noteChannelId && userData.noteMessageId)
                    ? `https://discord.com/channels/${guildId}/${userData.noteChannelId}/${userData.noteMessageId}`
                    : null;

                const byLine = noteLink
                    ? `*Set by <@${userData.noteSetBy}> on ${setAt} — [view entry](${noteLink})*`
                    : `*Set by <@${userData.noteSetBy}> on ${setAt}*`;

                embed.addFields({
                    name: '<:message:1000020218229305424> Staff Note',
                    value: `${note}\n${byLine}`,
                    inline: false,
                });
            }
        }

        await interaction.editReply({ embeds: [embed] });
    },
};