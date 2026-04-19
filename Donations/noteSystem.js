// JavaScript source code
// Donations/noteSystem.js
// Core logic for the global donation tracking & notes system.
// Completely separate from the Money Makers weekly system.

const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

// Channel where auto-tracked donation embeds are posted
const DONATION_LOG_CHANNEL_ID = 'YOUR_DONATION_LOG_CHANNEL_ID'; // <-- set this

// Dank Memer bot ID
const DANK_MEMER_BOT_ID = '270904126974590976';

// Transaction channel (where Dank Memer posts donation confirmations)
const TRANSACTION_CHANNEL_ID = '833246120389902356';

// Donation milestone roles — ordered descending so highest match wins
const MILESTONE_ROLES = [
    { amount: 10_000_000_000, roleId: '1349716423706148894' }, // 10bil
    { amount: 5_000_000_000, roleId: '946729964328337408' }, // 5bil
    { amount: 2_500_000_000, roleId: '768449168297033769' }, // 2.5bil
    { amount: 1_000_000_000, roleId: '768448955804811274' }, // 1bil
    { amount: 500_000_000, roleId: '768448715119263774' }, // 500mil
    { amount: 250_000_000, roleId: '768448459484692490' }, // 250mil
    { amount: 100_000_000, roleId: '768448257495531570' }, // 100mil
    { amount: 50_000_000, roleId: '764862842695712770' }, // 50mil
    { amount: 25_000_000, roleId: '764862737590910977' }, // 25mil
    { amount: 10_000_000, roleId: '924267631761055754' }, // 10mil
    { amount: 1_000_000, roleId: '924267243825659945' }, // 1mil
];

// ─────────────────────────────────────────────────────────────────────────────
// FILE PATH
// ─────────────────────────────────────────────────────────────────────────────

const DONATIONS_PATH = path.join(__dirname, '..', 'data', 'donations.json');

// ─────────────────────────────────────────────────────────────────────────────
// DISK I/O  —  always read fresh, never cache
// ─────────────────────────────────────────────────────────────────────────────

/**
 * donations.json shape:
 * {
 *   "userId": {
 *     "note":         "optional staff note",
 *     "noteSetBy":    "staffUserId",
 *     "noteSetAt":    "ISO string",
 *     "totalDonated": 123456789,
 *     "donations": [
 *       { "amount": 1000000, "timestamp": "ISO string" }
 *     ]
 *   }
 * }
 */
function loadDonations() {
    try {
        if (!fs.existsSync(DONATIONS_PATH)) return {};
        return JSON.parse(fs.readFileSync(DONATIONS_PATH, 'utf8'));
    } catch (e) {
        console.error('[NoteSystem] Failed to load donations.json:', e);
        return {};
    }
}

function saveDonations(data) {
    try {
        fs.writeFileSync(DONATIONS_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('[NoteSystem] Failed to save donations.json:', e);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/** Short label e.g. 1.25B, 35.00M */
function formatNumber(num) {
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
}

/** Full comma-separated number e.g. 1,250,000,000 */
function formatFull(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ─────────────────────────────────────────────────────────────────────────────
// MILESTONE ROLE LOGIC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assigns the highest qualifying milestone role and removes all lower ones.
 * Returns the new role object if a role-up happened, otherwise null.
 */
async function handleMilestoneRoles(member, totalDonated) {
    const target = MILESTONE_ROLES.find(m => totalDonated >= m.amount) ?? null;
    const allRoleIds = MILESTONE_ROLES.map(m => m.roleId);

    // Roles the member currently holds from our milestone set
    const currentMilestoneRoles = member.roles.cache.filter(r => allRoleIds.includes(r.id));

    if (!target) {
        // Below 1mil — strip any milestone roles they somehow have
        for (const [roleId] of currentMilestoneRoles) {
            await member.roles.remove(roleId).catch(e =>
                console.error(`[NoteSystem] Failed to remove role ${roleId}:`, e)
            );
        }
        return null;
    }

    // Remove every milestone role that isn't the target
    for (const [roleId] of currentMilestoneRoles) {
        if (roleId !== target.roleId) {
            await member.roles.remove(roleId).catch(e =>
                console.error(`[NoteSystem] Failed to remove role ${roleId}:`, e)
            );
        }
    }

    // Add target role if not already held
    if (!member.roles.cache.has(target.roleId)) {
        await member.roles.add(target.roleId).catch(e =>
            console.error(`[NoteSystem] Failed to add role ${target.roleId}:`, e)
        );
        return target; // role-up occurred
    }

    return null; // already had the correct role
}

// ─────────────────────────────────────────────────────────────────────────────
// DONOR RESOLUTION  (mirrors mupdate.js strategy)
// ─────────────────────────────────────────────────────────────────────────────

async function findDonor(message) {
    try {
        if (message.interaction?.user) return message.interaction.user.id;

        if (message.reference) {
            const ref = await message.fetchReference().catch(() => null);
            if (ref?.interaction?.user) return ref.interaction.user.id;
            if (ref?.author && !ref.author.bot) return ref.author.id;
        }

        const recent = await message.channel.messages.fetch({ limit: 10 }).catch(() => null);
        if (recent) {
            const donateMsg = recent.find(m =>
                m.interaction?.commandName === 'donate' &&
                Date.now() - m.createdTimestamp < 30_000
            );
            if (donateMsg) return donateMsg.interaction.user.id;
        }

        return null;
    } catch (e) {
        console.error('[NoteSystem] findDonor error:', e);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE: RECORD A DONATION
// Called by donationTracker.js on every confirmed Dank Memer donation
// ─────────────────────────────────────────────────────────────────────────────

async function recordDonation(client, donorId, donationAmount) {
    const guild = client.guilds.cache.first();
    const member = await guild?.members.fetch(donorId).catch(() => null);
    if (!member) {
        console.warn(`[NoteSystem] Member ${donorId} not found — skipping`);
        return;
    }

    // ── Update donations.json ─────────────────────────────────────────────────
    const data = loadDonations();

    if (!data[donorId]) {
        data[donorId] = {
            note: null,
            noteSetBy: null,
            noteSetAt: null,
            totalDonated: 0,
            donations: [],
        };
    }

    data[donorId].totalDonated = (data[donorId].totalDonated || 0) + donationAmount;
    data[donorId].donations.push({
        amount: donationAmount,
        timestamp: new Date().toISOString(),
    });

    saveDonations(data);

    const total = data[donorId].totalDonated;
    const note = data[donorId].note;

    // ── Handle milestone role-up ──────────────────────────────────────────────
    const newRole = await handleMilestoneRoles(member, total);

    // ── Send log embed ────────────────────────────────────────────────────────
    const logChannel = await client.channels.fetch(DONATION_LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel) {
        console.error('[NoteSystem] Donation log channel not found');
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle('<:prize:1000016483369369650>  Donation Recorded')
        .setColor('#4c00b0')
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: 'Donor', value: `<@${donorId}>`, inline: true },
            { name: 'Amount', value: `⏣ ${formatFull(donationAmount)}`, inline: true },
            { name: 'Total', value: `⏣ ${formatFull(total)}  *(${formatNumber(total)})*`, inline: true },
        )
        .setTimestamp();

    if (note) {
        embed.addFields({ name: '📝 Staff Note', value: note, inline: false });
    }

    if (newRole) {
        embed.addFields({
            name: '🎉 Milestone Reached!',
            value: `<@${donorId}> unlocked <@&${newRole.roleId}>`,
            inline: false,
        });
    }

    await logChannel.send({ embeds: [embed] }).catch(e =>
        console.error('[NoteSystem] Failed to send donation log embed:', e)
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    loadDonations,
    saveDonations,
    formatNumber,
    formatFull,
    findDonor,
    recordDonation,
    TRANSACTION_CHANNEL_ID,
    DANK_MEMER_BOT_ID,
    MILESTONE_ROLES,
};