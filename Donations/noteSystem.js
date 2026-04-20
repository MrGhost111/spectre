// Donations/noteSystem.js
// Core logic for the global donation tracking & notes system.
// Completely separate from the Money Makers weekly system.

const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const DONATION_LOG_CHANNEL_ID = '853991066042368020'; // <-- set this

const DANK_MEMER_BOT_ID      = '270904126974590976';
const TRANSACTION_CHANNEL_ID = '833246120389902356';

// Ordered descending — highest amount first
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
// AMOUNT PARSER
// Supports: raw integers, comma-separated, k, m/mil/million, b/bil/billion,
//           e-notation (1e6, 2.5e9), decimal multipliers (1.5b, 25.5m)
// Returns a floored integer, or null if the input can't be parsed.
// ─────────────────────────────────────────────────────────────────────────────

function parseAmount(input) {
    if (typeof input === 'number') return isNaN(input) ? null : Math.floor(input);

    const s = input.toString().trim().toLowerCase().replace(/,/g, '');

    // e-notation (e.g. 1e6, 2.5e9)
    if (/^[\d.]+e\d+$/.test(s)) {
        const val = parseFloat(s);
        return isNaN(val) ? null : Math.floor(val);
    }

    // number + optional suffix
    const match = s.match(/^([\d.]+)\s*(k|m|mil|million|b|bil|billion)?$/);
    if (!match) return null;

    const num    = parseFloat(match[1]);
    const suffix = match[2] ?? '';

    if (isNaN(num) || num < 0) return null;

    const multipliers = {
        k:       1_000,
        m:       1_000_000,
        mil:     1_000_000,
        million: 1_000_000,
        b:       1_000_000_000,
        bil:     1_000_000_000,
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
    if (num >= 1_000_000)     return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000)         return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
}

function formatFull(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ─────────────────────────────────────────────────────────────────────────────
// MILESTONE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Highest milestone the total qualifies for, or null */
function getCurrentMilestone(total) {
    return MILESTONE_ROLES.find(m => total >= m.amount) ?? null;
}

/** Next milestone above the total, or null if maxed out */
function getNextMilestone(total) {
    const above = MILESTONE_ROLES.filter(m => m.amount > total);
    return above.length ? above[above.length - 1] : null;
}

/**
 * Returns the threshold amount of the highest milestone role
 * the member currently holds in Discord, or 0 if none.
 */
function getBaselineFromRoles(member) {
    for (const milestone of MILESTONE_ROLES) { // already descending
        if (member.roles.cache.has(milestone.roleId)) {
            return milestone.amount;
        }
    }
    return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLE HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * UPGRADE-ONLY — used by recordDonation (auto-tracking).
 * Adds the highest qualifying milestone role if it's an upgrade.
 * Cleans up any lower milestone roles the user holds as duplicates.
 * NEVER removes a role that is equal-or-higher than what the total qualifies for.
 * Returns the newly added role object, or null if no change.
 */
async function handleMilestoneRolesUpgradeOnly(member, totalDonated) {
    const target     = getCurrentMilestone(totalDonated);
    const allRoleIds = MILESTONE_ROLES.map(m => m.roleId);

    if (!target) return null;

    // Highest role the member currently holds from our set
    const currentHighest = MILESTONE_ROLES.find(m => member.roles.cache.has(m.roleId)) ?? null;

    // No upgrade needed — they already hold an equal or higher role
    if (currentHighest && currentHighest.amount >= target.amount) return null;

    // Remove any lower milestone roles (duplicate cleanup only)
    for (const milestone of MILESTONE_ROLES) {
        if (
            milestone.amount < target.amount &&
            member.roles.cache.has(milestone.roleId)
        ) {
            await member.roles.remove(milestone.roleId).catch(e =>
                console.error(`[NoteSystem] Failed to remove lower role ${milestone.roleId}:`, e)
            );
        }
    }

    // Add the new target role
    await member.roles.add(target.roleId).catch(e =>
        console.error(`[NoteSystem] Failed to add role ${target.roleId}:`, e)
    );

    return target;
}

/**
 * FULL (upgrade + downgrade) — used by setnote/removenote (manual adjustments).
 * Assigns exactly one correct milestone role based on total, removes all others.
 * Returns the role object if any change was made, otherwise null.
 */
async function handleMilestoneRolesFull(member, totalDonated) {
    const target     = getCurrentMilestone(totalDonated);
    const allRoleIds = MILESTONE_ROLES.map(m => m.roleId);

    const currentMilestoneRoles = member.roles.cache.filter(r => allRoleIds.includes(r.id));

    if (!target) {
        // Below 1mil — strip all milestone roles
        for (const [roleId] of currentMilestoneRoles) {
            await member.roles.remove(roleId).catch(e =>
                console.error(`[NoteSystem] Failed to remove role ${roleId}:`, e)
            );
        }
        return currentMilestoneRoles.size > 0 ? { roleId: null, removed: true } : null;
    }

    let changed = false;

    // Remove every milestone role that isn't the target
    for (const [roleId] of currentMilestoneRoles) {
        if (roleId !== target.roleId) {
            await member.roles.remove(roleId).catch(e =>
                console.error(`[NoteSystem] Failed to remove role ${roleId}:`, e)
            );
            changed = true;
        }
    }

    // Add target role if not already held
    if (!member.roles.cache.has(target.roleId)) {
        await member.roles.add(target.roleId).catch(e =>
            console.error(`[NoteSystem] Failed to add role ${target.roleId}:`, e)
        );
        changed = true;
    }

    return changed ? target : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE: RECORD A DONATION  (called by mupdate.js)
// Returns { total, newRole } so mupdate can embed the new total.
// ─────────────────────────────────────────────────────────────────────────────

async function recordDonation(client, donorId, donationAmount, sourceChannel = null) {
    const guild  = client.guilds.cache.first();
    const member = await guild?.members.fetch(donorId).catch(() => null);
    if (!member) {
        console.warn(`[NoteSystem] Member ${donorId} not found — skipping`);
        return { total: 0, newRole: null };
    }

    const data = loadDonations();

    // New user — seed their baseline from highest Discord role they hold
    if (!data[donorId]) {
        const baseline = getBaselineFromRoles(member);
        data[donorId] = {
            note:         null,
            noteSetBy:    null,
            noteSetAt:    null,
            totalDonated: baseline,
            donations:    baseline > 0 ? [{
                amount:    baseline,
                timestamp: new Date().toISOString(),
                note:      'Baseline seeded from existing Discord role',
                manual:    true,
            }] : [],
        };
        if (baseline > 0) {
            console.log(`[NoteSystem] Seeded baseline ⏣ ${formatFull(baseline)} for ${donorId} from existing role`);
        }
    }

    data[donorId].totalDonated = (data[donorId].totalDonated || 0) + donationAmount;
    data[donorId].donations.push({
        amount:    donationAmount,
        timestamp: new Date().toISOString(),
    });

    saveDonations(data);

    const total = data[donorId].totalDonated;
    const note  = data[donorId].note;

    // Upgrade-only — auto-tracking never downgrades
    const newRole       = await handleMilestoneRolesUpgradeOnly(member, total);
    const nextMilestone = getNextMilestone(total);

    // Log embed
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
            { name: 'Donor',  value: `<@${donorId}>`,                                      inline: true },
            { name: '<:upvote:1303963379945181224> Amount', value: `⏣ ${formatFull(donationAmount)}`,                    inline: true },
            { name: '<:req:1000019378730975282> Total',  value: `⏣ ${formatFull(total)} *(${formatNumber(total)})*`,  inline: true },
        )
        .setTimestamp();

    if (nextMilestone) {
        const needed = nextMilestone.amount - total;
        embed.addFields({
            name:   '<:purpledot:860074414853586984> Next Milestone',
            value:  `<@&${nextMilestone.roleId}> — ⏣ ${formatFull(needed)} *(${formatNumber(needed)})* to go`,
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
            name:   '<:winners:1000018706874781806> Role Unlocked!',
            value:  `<@${donorId}> has reached <@&${newRole.roleId}>`,
            inline: false,
        });
    }

    // Send in the source channel where the donation happened (if provided)
    if (sourceChannel) {
        await sourceChannel.send({ embeds: [embed] }).catch(e =>
            console.error('[NoteSystem] Failed to send embed to source channel:', e)
        );
    }

    // Also send to the dedicated log channel
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
    parseAmount,
    formatNumber,
    formatFull,
    recordDonation,
    handleMilestoneRolesFull,
    getCurrentMilestone,
    getNextMilestone,
    TRANSACTION_CHANNEL_ID,
    DANK_MEMER_BOT_ID,
    MILESTONE_ROLES,
};
