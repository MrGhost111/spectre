const { EmbedBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const TIER_1_ROLE_ID = '783032959350734868';
const TIER_2_ROLE_ID = '1038888209440067604';
const ACTIVITY_CHANNEL_ID = '1327928516662005770';
const TIER_1_REQUIREMENT = 35_000_000;
const TIER_2_REQUIREMENT = 75_000_000;

const USERS_PATH = path.join(__dirname, '../data/users.json');
const STATS_PATH = path.join(__dirname, '../data/stats.json');

// ─────────────────────────────────────────────────────────────────────────────
// FILE I/O  — always read/write fresh from disk, never cache in memory
// ─────────────────────────────────────────────────────────────────────────────

function loadUsers() {
    try {
        if (!fs.existsSync(USERS_PATH)) return {};
        return JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
    } catch (e) {
        console.error('[DonationSystem] Failed to load users.json:', e);
        return {};
    }
}

function loadStats() {
    try {
        if (!fs.existsSync(STATS_PATH)) return { totalDonations: 0 };
        return JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
    } catch (e) {
        console.error('[DonationSystem] Failed to load stats.json:', e);
        return { totalDonations: 0 };
    }
}

function saveUsers(data) {
    try {
        fs.writeFileSync(USERS_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('[DonationSystem] Failed to save users.json:', e);
    }
}

function saveStats(data) {
    try {
        fs.writeFileSync(STATS_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('[DonationSystem] Failed to save stats.json:', e);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ─────────────────────────────────────────────────────────────────────────────
// DONOR RESOLUTION
// Dank Memer donation confirmations arrive as an edited message.
// The original message was the /donate slash command, so the donor is on
// the interaction object of that original message.
// ─────────────────────────────────────────────────────────────────────────────

async function findCommandUser(message) {
    try {
        // The edited message itself is the Dank Memer response —
        // check if it was a reply to a slash command interaction
        if (message.interaction?.user) {
            return message.interaction.user.id;
        }

        // If it references another message, check that message's interaction
        if (message.reference) {
            const ref = await message.fetchReference().catch(() => null);
            if (ref?.interaction?.user) return ref.interaction.user.id;
            if (ref?.author && !ref.author.bot) return ref.author.id;
        }

        // Last resort: scan recent messages in the channel for a /donate interaction
        const recent = await message.channel.messages.fetch({ limit: 10 }).catch(() => null);
        if (recent) {
            const donateMsg = recent.find(m =>
                m.interaction?.commandName === 'donate' &&
                Date.now() - m.createdTimestamp < 30_000 // within last 30s
            );
            if (donateMsg) return donateMsg.interaction.user.id;
        }

        return null;
    } catch (e) {
        console.error('[DonationSystem] findCommandUser error:', e);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// LEADERBOARD
// ─────────────────────────────────────────────────────────────────────────────

async function updateStatusBoard(client) {
    try {
        const activityChannel = await client.channels.fetch(ACTIVITY_CHANNEL_ID).catch(() => null);
        if (!activityChannel) {
            console.error('[DonationSystem] Activity channel not found');
            return;
        }

        const guild = client.guilds.cache.first();
        if (!guild) {
            console.error('[DonationSystem] No guild found');
            return;
        }

        const members = await guild.members.fetch().catch(() => null);
        if (!members) {
            console.error('[DonationSystem] Failed to fetch members');
            return;
        }

        // Always read fresh from disk so leaderboard reflects latest donations
        const usersData = loadUsers();
        const statsData = loadStats();

        const tier1Users = [];
        const tier2Users = [];

        for (const [memberId, member] of members) {
            const hasTier2 = member.roles.cache.has(TIER_2_ROLE_ID);
            const hasTier1 = member.roles.cache.has(TIER_1_ROLE_ID);

            if (!hasTier1 && !hasTier2) continue;

            // Ensure entry exists
            if (!usersData[memberId]) {
                usersData[memberId] = {
                    weeklyDonated: 0,
                    totalDonated: 0,
                    missedAmount: 0,
                    status: 'good',
                    currentTier: hasTier2 ? 2 : 1,
                    lastDonation: null,
                };
            }

            const userData = usersData[memberId];
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

        const embed = new EmbedBuilder()
            .setTitle('<:lbtest:1064919048242090054> Weekly Donations Leaderboard')
            .setColor('#4c00b0')
            .setTimestamp()
            .setFooter({ text: `Total Server Donations: ⏣ ${formatNumber(statsData.totalDonations || 0)}` });

        if (tier2Users.length > 0) {
            embed.addFields({
                name: '<:streak:1064909945373458522> Tier 2 Members',
                value: tier2Users.map((u, i) =>
                    `\`${i + 1}.\` <@${u.id}> ⏣ ${formatNumber(u.weeklyDonated)}/${formatNumber(u.requirement)}`
                ).join('\n'),
            });
        }

        if (tier1Users.length > 0) {
            embed.addFields({
                name: '<:YJ_streak:1259258046924853421> Tier 1 Members',
                value: tier1Users.map((u, i) =>
                    `\`${i + 1}.\` <@${u.id}> ⏣ ${formatNumber(u.weeklyDonated)}/${formatNumber(u.requirement)}`
                ).join('\n'),
            });
        }

        if (tier1Users.length === 0 && tier2Users.length === 0) {
            embed.setDescription('No tier members found.');
        }

        // Find existing leaderboard message and edit it, or send a new one
        const messages = await activityChannel.messages.fetch({ limit: 20 }).catch(() => null);
        const existing = messages?.find(m =>
            m.author.id === client.user.id &&
            m.embeds[0]?.title?.includes('Weekly Donations Leaderboard')
        );

        if (existing) {
            await existing.edit({ embeds: [embed] });
        } else {
            await activityChannel.send({ embeds: [embed] });
        }

    } catch (e) {
        console.error('[DonationSystem] updateStatusBoard error:', e);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    loadUsers,
    loadStats,
    saveUsers,
    saveStats,
    formatNumber,
    findCommandUser,
    updateStatusBoard,
    TIER_1_ROLE_ID,
    TIER_2_ROLE_ID,
    TIER_1_REQUIREMENT,
    TIER_2_REQUIREMENT,
};
