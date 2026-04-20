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

// Transaction channel ID (used by mupdate to decide routing)
const TRANSACTION_CHANNEL_ID = '833246120389902356';

// Donation milestone roles — ordered descending so highest match wins
const MILESTONE_ROLES = [
    { amount: 10_000_000_000, roleId: '1349716423706148894' }, // 10bil
    { amount:  5_000_000_000, roleId: '946729964328337408'  }, // 5bil
    { amount:  2_500_000_000, roleId: '768449168297033769'  }, // 2.5bil
    { amount:  1_000_000_000, roleId: '768448955804811274'  }, // 1bil
    { amount:    500_000_000, roleId: '768448715119263774'  }, // 500mil
    { amount:    250_000_000, roleId: '768448459484692490'  }, // 250mil
    { amount:    100_000_000, roleId: '768448257495531570'  }, // 100mil
    { amount:     50_000_000, roleId: '764862842695712770'  }, // 50mil
    { amount:     25_000_000, roleId: '764862737590910977'  }, // 25mil
    { amount:     10_000_000, roleId: '924267631761055754'  }, // 10mil
    { amount:      1_000_000, roleId: '924267243825659945'  }, // 1mil
];

// ─────────────────────────────────────────────────────────────────────────────
// FILE PATH
// ─────────────────────────────────────────────────────────────────────────────

const DONATIONS_PATH = path.join(__dirname, '..', 'data', 'donations.json');

// ─────────────────────────────────────────────────────────────────────────────
// DISK I/O
// ─────────────────────────────────────────────────────────────────────────────

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
    if (num >= 1_000_000)     return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000)         return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
}

/** Full comma-separated number e.g. 1,250,000,000 */
function formatFull(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ─────────────────────────────────────────────────────────────────────────────
// MILESTONE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the highest milestone the user qualifies for, or null */
function getCurrentMilestone(total) {
    return MILESTONE_ROLES.find(m => total >= m.amount) ?? null;
}

/** Returns the next milestone above the user's total, or null if maxed */
function getNextMilestone(total) {
    // MILESTONE_ROLES is descending, so next is the last one whose amount > total
    const above = MILESTONE_ROLES.filter(m => m.amount > total);
    return above.length ? above[above.length - 1] : null;
}

/**
 * Assigns the highest qualifying milestone role and removes all others.
 * Returns the new role object if a role-up happened, otherwise null.
 */
async function handleMilestoneRoles(member, totalDonated) {
    const target     = getCurrentMilestone(totalDonated);
    const allRoleIds = MILESTONE_ROLES.map(m => m.roleId);

    const currentMilestoneRoles = member.roles.cache.filter(r => allRoleIds.includes(r.id));

    if (!target) {
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

    // Add target if not already held
    if (!member.roles.cache.has(target.roleId)) {
        await member.roles.add(target.roleId).catch(e =>
            console.error(`[NoteSystem] Failed to add role ${target.roleId}:`, e)
        );
        return target; // role-up
    }

    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE: RECORD A DONATION
// Called by mupdate.js on every confirmed Dank Memer donation.
// Returns { total, newRole } so callers can use the new total in their embeds.
// ─────────────────────────────────────────────────────────────────────────────

async function recordDonation(client, donorId, donationAmount) {
    const guild  = client.guilds.cache.first();
    const member = await guild?.members.fetch(donorId).catch(() => null);
    if (!member) {
        console.warn(`[NoteSystem] Member ${donorId} not found — skipping`);
        return { total: 0, newRole: null };
    }

    // ── Update donations.json ─────────────────────────────────────────────────
    const data = loadDonations();

    if (!data[donorId]) {
        data[donorId] = {
            note:         null,
            noteSetBy:    null,
            noteSetAt:    null,
            totalDonated: 0,
            donations:    [],
        };
    }

    data[donorId].totalDonated = (data[donorId].totalDonated || 0) + donationAmount;
    data[donorId].donations.push({
        amount:    donationAmount,
        timestamp: new Date().toISOString(),
    });

    saveDonations(data);

    const total = data[donorId].totalDonated;
    const note  = data[donorId].note;

    // ── Handle milestone roles ────────────────────────────────────────────────
    const newRole    = await handleMilestoneRoles(member, total);
    const nextMilestone = getNextMilestone(total);

    // ── Build log embed ───────────────────────────────────────────────────────
    const logChannel = await client.channels.fetch(DONATION_LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel) {
        console.error('[NoteSystem] Donation log channel not found');
        return { total, newRole };
    }

    const embed = new EmbedBuilder()
        .setTitle('<:prize:1000016483369369650>  Donation Recorded')
        .setColor('#4c00b0')
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: 'Donor',  value: `<@${donorId}>`,                                          inline: true },
            { name: 'Amount', value: `⏣ ${formatFull(donationAmount)}`,                        inline: true },
            { name: 'Total',  value: `⏣ ${formatFull(total)}  *(${formatNumber(total)})*`,     inline: true },
        )
        .setTimestamp();

    if (nextMilestone) {
        const needed = nextMilestone.amount - total;
        embed.addFields({
            name:   '🎯 Next Milestone',
            value:  `<@&${nextMilestone.roleId}> — ⏣ ${formatFull(needed)} *(${formatNumber(needed)})* to go`,
            inline: false,
        });
    } else {
        embed.addFields({
            name:   '🏆 Milestone',
            value:  'Max milestone reached!',
            inline: false,
        });
    }

    if (note) {
        embed.addFields({ name: '📝 Staff Note', value: note, inline: false });
    }

    if (newRole) {
        embed.addFields({
            name:   '🎉 Role Unlocked!',
            value:  `<@${donorId}> has reached <@&${newRole.roleId}>`,
            inline: false,
        });
    }

    await logChannel.send({ embeds: [embed] }).catch(e =>
        console.error('[NoteSystem] Failed to send donation log embed:', e)
    );

    return { total, newRole };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    loadDonations,
    saveDonations,
    formatNumber,
    formatFull,
    recordDonation,
    handleMilestoneRoles,
    getCurrentMilestone,
    getNextMilestone,
    TRANSACTION_CHANNEL_ID,
    DANK_MEMER_BOT_ID,
    MILESTONE_ROLES,
};
