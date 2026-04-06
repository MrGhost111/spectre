// JavaScript source code
// donationSystem.js
// Shared helpers used by both mupdate.js (donation tracking) and resetweekly (reset logic).
// Rule: NEVER use require() to load JSON — always read from disk so data is always fresh.

const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ─── Constants ────────────────────────────────────────────────────────────────
const ACTIVITY_CHANNEL_ID = '1327928516662005770';
const TIER_1_ROLE_ID = '783032959350734868';
const TIER_2_ROLE_ID = '1038888209440067604';
const TIER_1_REQUIREMENT = 35000000;
const TIER_2_REQUIREMENT = 70000000;

const usersFilePath = path.join(__dirname, 'data/users.json');
const statsFilePath = path.join(__dirname, 'data/stats.json');

// ─── Disk I/O (always fresh — never cached) ───────────────────────────────────
function loadUsers() {
    try {
        return fs.existsSync(usersFilePath)
            ? JSON.parse(fs.readFileSync(usersFilePath, 'utf8'))
            : {};
    } catch (e) {
        console.error('[DATA] Failed to load users.json:', e);
        return {};
    }
}

function loadStats() {
    try {
        return fs.existsSync(statsFilePath)
            ? JSON.parse(fs.readFileSync(statsFilePath, 'utf8'))
            : { totalDonations: 0 };
    } catch (e) {
        console.error('[DATA] Failed to load stats.json:', e);
        return { totalDonations: 0 };
    }
}

function saveUsers(data) {
    try {
        fs.writeFileSync(usersFilePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('[DATA] Failed to save users.json:', e);
    }
}

function saveStats(data) {
    try {
        fs.writeFileSync(statsFilePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('[DATA] Failed to save stats.json:', e);
    }
}

// ─── Formatting ───────────────────────────────────────────────────────────────
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ─── Weekly Stats (reads live from disk + guild roles) ────────────────────────
async function getWeeklyStats(client) {
    const usersData = loadUsers();
    const guild = client.guilds.cache.first();
    const members = await guild.members.fetch();

    const tier1Users = [];
    const tier2Users = [];

    for (const [memberId, member] of members) {
        const hasTier1 = member.roles.cache.has(TIER_1_ROLE_ID);
        const hasTier2 = member.roles.cache.has(TIER_2_ROLE_ID);
        if (!hasTier1 && !hasTier2) continue;

        const userData = usersData[memberId] || { weeklyDonated: 0, missedAmount: 0 };
        const requirement = hasTier2
            ? TIER_2_REQUIREMENT
            : TIER_1_REQUIREMENT + (userData.missedAmount || 0);

        const entry = {
            id: memberId,
            weeklyDonated: userData.weeklyDonated || 0,
            requirement,
        };

        if (hasTier2) tier2Users.push(entry);
        else tier1Users.push(entry);
    }

    tier2Users.sort((a, b) => b.weeklyDonated - a.weeklyDonated);
    tier1Users.sort((a, b) => b.weeklyDonated - a.weeklyDonated);

    return { tier1Users, tier2Users };
}

// ─── Leaderboard Board (edit existing message or send new one) ────────────────
async function updateStatusBoard(client) {
    try {
        const activityChannel = await client.channels.fetch(ACTIVITY_CHANNEL_ID);
        const { tier1Users, tier2Users } = await getWeeklyStats(client);
        const stats = loadStats();

        const embed = new EmbedBuilder()
            .setTitle('<:lbtest:1064919048242090054>  Weekly Donations Leaderboard')
            .setColor('#4c00b0')
            .setTimestamp()
            .setFooter({ text: `Total Server Donations: ⏣ ${formatNumber(stats.totalDonations)}` });

        if (tier2Users.length > 0) {
            embed.addFields({
                name: '<:streak:1064909945373458522>  Tier 2 Members',
                value: tier2Users.map((u, i) =>
                    `\`${i + 1}.\` <@${u.id}> ⏣ ${formatNumber(u.weeklyDonated)}/${formatNumber(u.requirement)}`
                ).join('\n'),
            });
        }

        if (tier1Users.length > 0) {
            embed.addFields({
                name: '<:YJ_streak:1259258046924853421>  Tier 1 Members',
                value: tier1Users.map((u, i) =>
                    `\`${i + 1}.\` <@${u.id}> ⏣ ${formatNumber(u.weeklyDonated)}/${formatNumber(u.requirement)}`
                ).join('\n'),
            });
        }

        const messages = await activityChannel.messages.fetch({ limit: 20 });
        const existing = messages.find(m =>
            m.author.id === client.user.id &&
            m.embeds[0]?.title?.includes('Weekly Donations Leaderboard')
        );

        if (existing) {
            await existing.edit({ embeds: [embed] });
        } else {
            await activityChannel.send({ embeds: [embed] });
        }
    } catch (e) {
        console.error('[BOARD] Error updating status board:', e);
    }
}

// ─── Resolve who ran the Dank Memer command ───────────────────────────────────
async function findCommandUser(message) {
    try {
        if (message.interaction?.user) return message.interaction.user.id;

        if (message.reference) {
            const ref = await message.fetchReference().catch(() => null);
            if (ref?.interaction?.user) return ref.interaction.user.id;
        }

        const footer = message.embeds[0]?.footer?.text;
        if (footer) {
            const match = footer.match(/<@!?(\d+)>/);
            if (match) return match[1];
        }

        return null;
    } catch (e) {
        console.error('[DONOR] Error finding command user:', e);
        return null;
    }
}

module.exports = {
    // Data I/O
    loadUsers,
    loadStats,
    saveUsers,
    saveStats,
    // Helpers
    formatNumber,
    findCommandUser,
    // Logic
    getWeeklyStats,
    updateStatusBoard,
    // Constants (exported so resetweekly can use them without re-declaring)
    TIER_1_ROLE_ID,
    TIER_2_ROLE_ID,
    TIER_1_REQUIREMENT,
    TIER_2_REQUIREMENT,
    ACTIVITY_CHANNEL_ID,
};