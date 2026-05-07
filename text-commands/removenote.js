// textcommands/removenote.js
// Usage: ,removenote @user <amount> [event] [note...]

const { EmbedBuilder } = require('discord.js');
const {
    loadDonations,
    saveDonations,
    parseAmount,
    formatFull,
    formatNumber,
    handleMilestoneRolesFull,
    getNextMilestone,
    getAllRolesUpTo,
    EVENT_LABELS,
    EVENT_CURRENCY,
    DONATION_LOG_CHANNEL_ID,
} = require('../Donations/noteSystem');

const ROLE_EVENT_PERMISSIONS = {
    '746298070685188197': ['dankmemer', 'investor'],
    '710572344745132114': ['dankmemer', 'investor'],
    '806450472474116136': ['dankmemer', 'investor'],
    '712970141834674207': ['dankmemer', 'investor'],
    '1028276735357227029': ['karuta'],
    '1487607589998166157': ['owo'],
};

const VALID_EVENTS = ['dankmemer', 'investor', 'karuta', 'owo'];

function getAllowedEvents(member) {
    const allowed = new Set();
    for (const [roleId, events] of Object.entries(ROLE_EVENT_PERMISSIONS)) {
        if (member.roles.cache.has(roleId)) events.forEach(e => allowed.add(e));
    }
    return allowed;
}

function fmtAmount(currency, amount) {
    return `${currency} ${formatFull(amount)}`;
}

module.exports = {
    name: 'removenote',
    aliases: ['rn', 'remnote'],
    description: 'Manually remove a donation amount from a user.',
    async execute(message, args) {
        const allowedEvents = getAllowedEvents(message.member);
        if (allowedEvents.size === 0) {
            return message.reply('You do not have permission to use this command.');
        }

        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply('Please mention a user. Usage: `,removenote @user <amount> [event] [note...]`');
        }

        // Strip mention from args
        const remaining = args.filter(a => !a.match(/^<@!?\d+>$/));

        const amountRaw = remaining[0];
        if (!amountRaw) {
            return message.reply('Please provide an amount. Usage: `,removenote @user <amount> [event] [note...]`');
        }

        // Check if second arg is an event
        let event = 'dankmemer';
        let noteStartIndex = 1;
        if (remaining[1] && VALID_EVENTS.includes(remaining[1].toLowerCase())) {
            event = remaining[1].toLowerCase();
            noteStartIndex = 2;
        }

        const noteText = remaining.slice(noteStartIndex).join(' ') || null;

        if (!allowedEvents.has(event)) {
            return message.reply(
                `You do not have permission to edit **${EVENT_LABELS[event]}** donations. ` +
                `Your role only allows: ${[...allowedEvents].map(e => EVENT_LABELS[e]).join(', ')}.`
            );
        }

        const amount = parseAmount(amountRaw);
        if (amount === null || amount <= 0) {
            return message.reply(
                `Could not parse \`${amountRaw}\` as an amount. ` +
                `Try formats like: \`25m\`, \`1.5b\`, \`1bil\`, \`1e6\`, \`1000000\`.`
            );
        }

        const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
            return message.reply('Could not find that member in this server.');
        }

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

        const sent = await message.channel.send({ content: '⏳ Processing...' });

        data[targetUser.id].donations.push({
            amount: -actualRemoved,
            timestamp: new Date().toISOString(),
            removedBy: message.author.id,
            manual: true,
            channelId: message.channelId,
            messageId: sent.id,
        });

        if (noteText !== null) {
            data[targetUser.id].note = noteText;
            data[targetUser.id].noteSetBy = message.author.id;
            data[targetUser.id].noteSetAt = new Date().toISOString();
            data[targetUser.id].noteChannelId = message.channelId;
            data[targetUser.id].noteMessageId = sent.id;
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

        const embed = new EmbedBuilder()
            .setTitle(`<:message:1000020218229305424>  Donation Removed — ${eventLabel}`)
            .setColor('#4c00b0')
            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User', value: `<@${targetUser.id}>`, inline: true },
                { name: '<:downvote:1303963004915679232> Removed', value: fmtAmount(currency, actualRemoved), inline: true },
                { name: '<:req:1000019378730975282> New Total', value: fmtAmount(currency, newTotal), inline: true },
                { name: 'Removed By', value: `<@${message.author.id}>`, inline: true },
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

        await sent.edit({ content: null, embeds: [embed] });

        const logChannel = await message.client.channels.fetch(DONATION_LOG_CHANNEL_ID).catch(() => null);
        if (logChannel) {
            const jumpLink = `https://discord.com/channels/${message.guildId}/${message.channelId}/${sent.id}`;

            const logEmbed = new EmbedBuilder()
                .setTitle('<:prize:1000016483369369650>  Donation Removed (Manual)')
                .setColor('#b00000')
                .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'Donor', value: `<@${targetUser.id}>`, inline: true },
                    { name: '<:downvote:1303963004915679232> Removed', value: fmtAmount(currency, actualRemoved), inline: true },
                    { name: '<:req:1000019378730975282> New Total', value: fmtAmount(currency, newTotal), inline: true },
                    { name: 'Removed By', value: `<@${message.author.id}>`, inline: true },
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

            logEmbed.addFields({ name: '🔗 Source', value: `[Jump to command](${jumpLink})`, inline: false });

            await logChannel.send({ embeds: [logEmbed] }).catch(e =>
                console.error('[removenote] Failed to send to log channel:', e)
            );
        }
    },
};