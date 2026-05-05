// Donations/noteSystem.js
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const DONATION_LOG_CHANNEL_ID = '853991066042368020';
const DANK_MEMER_BOT_ID = '270904126974590976';
const TRANSACTION_CHANNEL_ID = '833246120389902356';

const EVENT_FILES = {
    dankmemer: path.join(__dirname, '..', 'data', 'donations.json'),
    investor: path.join(__dirname, '..', 'data', 'investor.json'),
    karuta: path.join(__dirname, '..', 'data', 'karuta.json'),
    owo: path.join(__dirname, '..', 'data', 'owo.json'),
};

const EVENT_LABELS = {
    dankmemer: 'Dank Memer',
    investor: 'Investor',
    karuta: 'Karuta',
    owo: 'OwO',
};

const EVENT_CURRENCY = {
    dankmemer: '⏣',
    investor: '<a:cash:1498053763183808543>',
    karuta: '🎟️',
    owo: '<:owo_cash:1501038176817512560>',
};

const MILESTONE_ROLES = {
    dankmemer: [
        { amount: 10_000_000_000, roleId: '1349716423706148894' },
        { amount: 5_000_000_000, roleId: '946729964328337408' },
        { amount: 2_500_000_000, roleId: '768449168297033769' },
        { amount: 1_000_000_000, roleId: '768448955804811274' },
        { amount: 500_000_000, roleId: '768448715119263774' },
        { amount: 250_000_000, roleId: '768448459484692490' },
        { amount: 100_000_000, roleId: '768448257495531570' },
        { amount: 50_000_000, roleId: '764862842695712770' },
        { amount: 25_000_000, roleId: '764862737590910977' },
        { amount: 10_000_000, roleId: '924267631761055754' },
        { amount: 1_000_000, roleId: '924267243825659945' },
    ],
    investor: [
        { amount: 100, roleId: '866641313754251297' },
        { amount: 50, roleId: '866641299355861022' },
        { amount: 25, roleId: '866641249452556309' },
        { amount: 10, roleId: '866641177943080960' },
        { amount: 5, roleId: '866641062441254932' },
    ],
    karuta: [
        { amount: 500, roleId: '1038106794200932512' },
        { amount: 300, roleId: '1028256279124250624' },
        { amount: 100, roleId: '1028256286560763984' },
        { amount: 50, roleId: '1030707878597763103' },
        { amount: 10, roleId: '1028256324619874374' },
    ],
    owo: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// FILE I/O
// ─────────────────────────────────────────────────────────────────────────────

function resolveFile(event = 'dankmemer') {
    const file = EVENT_FILES[event];
    if (!file) throw new Error(`[NoteSystem] Unknown event type: "${event}"`);
    return file;
}

function loadDonations(event = 'dankmemer') {
    try {
        const file = resolveFile(event);
        if (!fs.existsSync(file)) return {};
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        console.error('[NoteSystem] Failed to load donations file:', e);
        return {};
    }
}

function saveDonations(data, event = 'dankmemer') {
    try {
        const file = resolveFile(event);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('[NoteSystem] Failed to save donations file:', e);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// AMOUNT PARSER
// ─────────────────────────────────────────────────────────────────────────────

function parseAmount(input) {
    if (typeof input === 'number') return isNaN(input) ? null : Math.floor(input);

    const s = input.toString().trim().toLowerCase().replace(/,/g, '');

    if (/^[\d.]+e\d+$/.test(s)) {
        const val = parseFloat(s);
        return isNaN(val) ? null : Math.floor(val);
    }

    const match = s.match(/^([\d.]+)\s*(k|m|mil|million|b|bil|billion)?$/);
    if (!match) return null;

    const num = parseFloat(match[1]);
    const suffix = match[2] ?? '';

    if (isNaN(num) || num < 0) return null;

    const multipliers = {
        k: 1_000,
        m: 1_000_000,
        mil: 1_000_000,
        million: 1_000_000,
        b: 1_000_000_000,
        bil: 1_000_000_000,
        billion: 1_000_000_000,
    };

    const result = suffix ? num * (multipliers[suffix] ?? 1) : num;
    return Math.floor(result);
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function formatNumber(num) {
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
}

function formatFull(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ─────────────────────────────────────────────────────────────────────────────
// MILESTONE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getMilestones(event = 'dankmemer') {
    return MILESTONE_ROLES[event] ?? [];
}

function getCurrentMilestone(total, event = 'dankmemer') {
    return getMilestones(event).find(m => total >= m.amount) ?? null;
}

function getNextMilestone(total, event = 'dankmemer') {
    const above = getMilestones(event).filter(m => m.amount > total);
    return above.length ? above[above.length - 1] : null;
}

function getAllRolesUpTo(amount, event = 'dankmemer') {
    return getMilestones(event).filter(m => m.amount <= amount);
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLE HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

async function handleMilestoneRolesUpgradeOnly(member, totalDonated, event = 'dankmemer') {
    const rolesToHave = getAllRolesUpTo(totalDonated, event);
    let topAdded = null;

    for (const milestone of rolesToHave) {
        if (!member.roles.cache.has(milestone.roleId)) {
            await member.roles.add(milestone.roleId).catch(e =>
                console.error(`[NoteSystem] Failed to add role ${milestone.roleId}:`, e)
            );
            if (!topAdded) topAdded = milestone;
        }
    }

    return topAdded;
}

async function handleMilestoneRolesFull(member, totalDonated, event = 'dankmemer') {
    const allMilestones = getMilestones(event);
    if (allMilestones.length === 0) return null;

    const rolesToHave = new Set(getAllRolesUpTo(totalDonated, event).map(m => m.roleId));
    const allRoleIds = allMilestones.map(m => m.roleId);

    for (const roleId of allRoleIds) {
        if (!rolesToHave.has(roleId) && member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId).catch(e =>
                console.error(`[NoteSystem] Failed to remove role ${roleId}:`, e)
            );
        }
    }

    for (const roleId of rolesToHave) {
        if (!member.roles.cache.has(roleId)) {
            await member.roles.add(roleId).catch(e =>
                console.error(`[NoteSystem] Failed to add role ${roleId}:`, e)
            );
        }
    }

    return getCurrentMilestone(totalDonated, event);
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE: RECORD A DONATION
// ─────────────────────────────────────────────────────────────────────────────

async function recordDonation(
    client,
    donorId,
    donationAmount,
    sourceChannel = null,
    sourceMessage = null,
    donationMeta = null,
) {
    const guild = client.guilds.cache.first();
    const member = await guild?.members.fetch(donorId).catch(() => null);
    if (!member) {
        console.warn(`[NoteSystem] Member ${donorId} not found — skipping`);
        return { total: 0, newRole: null };
    }

    const event = 'dankmemer';
    const data = loadDonations(event);

    if (!data[donorId]) {
        data[donorId] = {
            note: null,
            noteSetBy: null,
            noteSetAt: null,
            noteChannelId: null,
            noteMessageId: null,
            totalDonated: 0,
            donations: [],
        };
    }

    data[donorId].totalDonated = (data[donorId].totalDonated || 0) + donationAmount;
    data[donorId].donations.push({
        amount: donationAmount,
        timestamp: new Date().toISOString(),
        channelId: sourceMessage?.channelId ?? sourceChannel?.id ?? null,
        messageId: sourceMessage?.id ?? null,
        ...(donationMeta ? {
            itemName: donationMeta.itemName,
            itemQty: donationMeta.itemQty,
            pricePerUnit: donationMeta.pricePerUnit,
        } : {}),
    });

    saveDonations(data, event);

    const total = data[donorId].totalDonated;
    const note = data[donorId].note;

    const newRole = await handleMilestoneRolesUpgradeOnly(member, total, event);
    const nextMilestone = getNextMilestone(total, event);

    const logChannel = await client.channels.fetch(DONATION_LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel) {
        console.error('[NoteSystem] Donation log channel not found');
        return { total, newRole };
    }

    let amountValue;
    if (donationMeta?.itemName) {
        const { itemName, itemQty, pricePerUnit } = donationMeta;
        amountValue = `**${itemQty} × ${itemName}**\n⏣ ${formatFull(donationAmount)} total`;
        if (pricePerUnit && itemQty > 1) {
            amountValue += `  (⏣ ${formatFull(pricePerUnit)} each)`;
        }
    } else {
        amountValue = `⏣ ${formatFull(donationAmount)}`;
    }

    const srcChannelId = sourceMessage?.channelId ?? sourceMessage?.channel?.id ?? null;
    const srcMessageId = sourceMessage?.id ?? null;
    const jumpLink = (srcChannelId && srcMessageId)
        ? `https://discord.com/channels/${guild.id}/${srcChannelId}/${srcMessageId}`
        : null;

    function buildEmbed({ includeJumpLink } = {}) {
        const embed = new EmbedBuilder()
            .setTitle('<:prize:1000016483369369650>  Donation Recorded')
            .setColor('#4c00b0')
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'Donor', value: `<@${donorId}>`, inline: true },
                { name: '<:upvote:1303963379945181224> Amount', value: amountValue, inline: true },
                { name: '<:req:1000019378730975282> Total', value: `⏣ ${formatFull(total)} *(${formatNumber(total)})*`, inline: true },
            )
            .setTimestamp();

        if (nextMilestone) {
            const needed = nextMilestone.amount - total;
            embed.addFields({
                name: '<:purpledot:860074414853586984> Next Milestone',
                value: `<@&${nextMilestone.roleId}> — ⏣ ${formatFull(needed)} *(${formatNumber(needed)})* to go`,
                inline: false,
            });
        } else {
            embed.addFields({ name: '<:winners:1000018706874781806> Milestone', value: 'Max milestone reached!', inline: false });
        }

        if (note) {
            embed.addFields({ name: '<:message:1000020218229305424> Staff Note', value: note, inline: false });
        }

        if (newRole) {
            embed.addFields({
                name: '<:winners:1000018706874781806> Role Unlocked!',
                value: `<@${donorId}> has reached <@&${newRole.roleId}>`,
                inline: false,
            });
        }

        if (includeJumpLink && jumpLink) {
            embed.addFields({
                name: '🔗 Source',
                value: `[Jump to donation](${jumpLink})`,
                inline: false,
            });
        }

        return embed;
    }

    if (sourceChannel) {
        await sourceChannel.send({ embeds: [buildEmbed({ includeJumpLink: false })] }).catch(e =>
            console.error('[NoteSystem] Failed to send embed to source channel:', e)
        );
    }

    await logChannel.send({ embeds: [buildEmbed({ includeJumpLink: true })] }).catch(e =>
        console.error('[NoteSystem] Failed to send donation log embed:', e)
    );

    return { total, newRole };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    EVENT_FILES,
    EVENT_LABELS,
    EVENT_CURRENCY,
    loadDonations,
    saveDonations,
    parseAmount,
    formatNumber,
    formatFull,
    getCurrentMilestone,
    getNextMilestone,
    getAllRolesUpTo,
    handleMilestoneRolesFull,
    recordDonation,
    TRANSACTION_CHANNEL_ID,
    DANK_MEMER_BOT_ID,
    DONATION_LOG_CHANNEL_ID,
    MILESTONE_ROLES,
};