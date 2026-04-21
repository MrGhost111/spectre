// Donations/noteSystem.js
// Core logic for the global donation tracking & notes system.
// Completely separate from the Money Makers weekly system.

const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const DONATION_LOG_CHANNEL_ID = '853991066042368020';

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
    for (const milestone of MILESTONE_ROLES) {
        if (member.roles.cache.has(milestone.roleId)) {
            return milestone.amount;
        }
    }
    return 0;
}

/**
 * All milestones at or below a given threshold amount (i.e. all roles
 * a user at that level should hold). Returns array in descending order.
 */
function getAllRolesUpTo(amount) {
    return MILESTONE_ROLES.filter(m => m.amount <= amount);
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLE HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * UPGRADE-ONLY — used by recordDonation (auto-tracking).
 *
 * Rules:
 *   - Determine the effective total = max(totalDonated, highest Discord role held).
 *   - Assign ALL milestone roles at or below that effective total.
 *   - NEVER remove any role the user currently holds from our milestone set.
 *
 * Returns the newly added top role object, or null if nothing changed.
 */
async function handleMilestoneRolesUpgradeOnly(member, totalDonated) {
    // Floor: respect whatever roles they already hold in Discord
    const discordFloor   = getBaselineFromRoles(member);
    const effectiveTotal = Math.max(totalDonated, discordFloor);

    const target = getCurrentMilestone(effectiveTotal);
    if (!target) return null; // below 1mil even after floor — nothing to do

    const rolesToHave = getAllRolesUpTo(effectiveTotal);
    let   topAdded    = null;

    for (const milestone of rolesToHave) {
        if (!member.roles.cache.has(milestone.roleId)) {
            await member.roles.add(milestone.roleId).catch(e =>
                console.error(`[NoteSystem] Failed to add role ${milestone.roleId}:`, e)
            );
            // Track the highest role we actually added (array is descending)
            if (!topAdded) topAdded = milestone;
        }
    }

    return topAdded;
}

/**
 * FULL (used by setnote / removenote — manual adjustments).
 *
 * Rules:
 *   - Determine the effective total = max(totalDonated, highest Discord role held).
 *   - Assign ALL milestone roles at or below the effective total.
 *   - Remove any milestone roles ABOVE the effective total (those weren't earned).
 *   - NEVER remove a role that is at or below the effective total.
 *
 * Returns the top milestone object if any change was made, otherwise null.
 */
async function handleMilestoneRolesFull(member, totalDonated) {
    const allRoleIds = MILESTONE_ROLES.map(m => m.roleId);

    // Floor: respect whatever roles they already hold in Discord
    const discordFloor   = getBaselineFromRoles(member);
    const effectiveTotal = Math.max(totalDonated, discordFloor);

    const target = getCurrentMilestone(effectiveTotal);

    if (!target) {
        // Below 1mil even after accounting for Discord roles — strip all milestone roles
        const currentMilestoneRoles = member.roles.cache.filter(r => allRoleIds.includes(r.id));
        for (const [roleId] of currentMilestoneRoles) {
            await member.roles.remove(roleId).catch(e =>
                console.error(`[NoteSystem] Failed to remove role ${roleId}:`, e)
            );
        }
        return currentMilestoneRoles.size > 0 ? { roleId: null, removed: true } : null;
    }

    const rolesToHave   = new Set(getAllRolesUpTo(effectiveTotal).map(m => m.roleId));
    const rolesToRemove = MILESTONE_ROLES.filter(m => !rolesToHave.has(m.roleId)); // above effective total
    let   changed       = false;

    // Remove milestone roles that are above the effective total
    for (const milestone of rolesToRemove) {
        if (member.roles.cache.has(milestone.roleId)) {
            await member.roles.remove(milestone.roleId).catch(e =>
                console.error(`[NoteSystem] Failed to remove role ${milestone.roleId}:`, e)
            );
            changed = true;
        }
    }

    // Add every milestone role at or below the effective total
    for (const roleId of rolesToHave) {
        if (!member.roles.cache.has(roleId)) {
            await member.roles.add(roleId).catch(e =>
                console.error(`[NoteSystem] Failed to add role ${roleId}:`, e)
            );
            changed = true;
        }
    }

    return changed ? target : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE: RECORD A DONATION  (called by mupdate.js)
// Returns { total, newRole } so mupdate can embed the new total.
// ─────────────────────────────────────────────────────────────────────────────

async function recordDonation(client, donorId, donationAmount, sourceChannel = null, sourceMessage = null) {
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
        channelId: sourceMessage?.channelId ?? sourceChannel?.id ?? null,
        messageId: sourceMessage?.id ?? null,
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

    if (sourceChannel) {
        await sourceChannel.send({ embeds: [embed] }).catch(e =>
            console.error('[NoteSystem] Failed to send embed to source channel:', e)
        );
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
