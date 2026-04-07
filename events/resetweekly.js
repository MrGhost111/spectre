// events/resetweekly.js  (NOT a Discord event listener — just exports weeklyReset)
// Called by:
//   • index.js cron job  (every Sunday 00:00 UTC)
//   • text-commands/resetweekly.js  (manual admin trigger)

const { EmbedBuilder } = require('discord.js');
const {
    loadUsers,
    loadStats,
    saveUsers,
    saveStats,
    formatNumber,
    getWeeklyStats,
    updateStatusBoard,
    TIER_1_ROLE_ID,
    TIER_2_ROLE_ID,
    TIER_1_REQUIREMENT,
    TIER_2_REQUIREMENT,
    ACTIVITY_CHANNEL_ID,
} = require('../donationSystem');

const ANNOUNCEMENT_CHANNEL_ID = '833241820959473724';
const TRANSACTION_CHANNEL_ID  = '833246120389902356';
const ADMIN_CHANNEL_ID        = '966598961353850910';
const PRO_MAKER_ROLE_ID       = '838478632451178506';

async function weeklyReset(client) {
    try {
        console.log('[RESET] Starting weekly reset');

        const usersData = loadUsers();
        const statsData = loadStats();

        const guild               = client.guilds.cache.first();
        const announcementChannel = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
        const adminChannel        = await client.channels.fetch(ADMIN_CHANNEL_ID);

        const summary          = { promotions: [], demotions: [] };
        const promotionUserIds = [];

        let weeklyDonations = 0;
        let topDonors       = [];
        let topDonation     = 0;

        const tier1Donations = [];
        const tier2Donations = [];

        // Fetch only members who are in usersData — avoids fetching all 15k members
        console.log('[RESET] Fetching relevant members...');
        const members = new Map();
        for (const userId of Object.keys(usersData)) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member) members.set(userId, member);
        }
        console.log(`[RESET] Fetched ${members.size} relevant members`);

        // ── Build donation totals, find top donor, collect tier lists ─────────
        for (const [userId, userData] of Object.entries(usersData)) {
            const donated = userData.weeklyDonated || 0;
            weeklyDonations += donated;

            if (donated > topDonation) {
                topDonors   = [{ id: userId, donation: donated, timestamp: userData.lastDonation || new Date().toISOString() }];
                topDonation = donated;
            } else if (donated === topDonation && topDonation > 0) {
                topDonors.push({ id: userId, donation: donated, timestamp: userData.lastDonation || new Date().toISOString() });
            }

            if (donated === 0) continue;

            const member = members.get(userId);
            if (!member) continue;

            const hasTier2 = member.roles.cache.has(TIER_2_ROLE_ID);
            const hasTier1 = member.roles.cache.has(TIER_1_ROLE_ID);

            if (hasTier2)      tier2Donations.push({ id: userId, donated });
            else if (hasTier1) tier1Donations.push({ id: userId, donated });
        }

        // Earliest timestamp wins ties
        topDonors.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const topDonor = topDonors[0]?.id ?? null;

        statsData.totalDonations += weeklyDonations;

        // ── Weekly stats embed (pre-reset numbers) ────────────────────────────
        const { tier1Users, tier2Users } = await getWeeklyStats(client);

        const weeklyStatsEmbed = new EmbedBuilder()
            .setTitle('<:lbtest:1064919048242090054>  Weekly Stats')
            .setColor('#4c00b0')
            .setDescription('Here is how our Money Makers performed this week:');

        if (tier2Users.length > 0) {
            weeklyStatsEmbed.addFields({
                name:  '<:streak:1064909945373458522>  Tier 2',
                value: tier2Users.map((u, i) =>
                    `\`${i + 1}.\` <@${u.id}> ⏣ ${formatNumber(u.weeklyDonated)}/${formatNumber(u.requirement)}`
                ).join('\n'),
            });
        }

        if (tier1Users.length > 0) {
            weeklyStatsEmbed.addFields({
                name:  '<:YJ_streak:1259258046924853421>  Tier 1',
                value: tier1Users.map((u, i) =>
                    `\`${i + 1}.\` <@${u.id}> ⏣ ${formatNumber(u.weeklyDonated)}/${formatNumber(u.requirement)}`
                ).join('\n'),
            });
        }

        // ── Announcement ──────────────────────────────────────────────────────
        await announcementChannel.send(
            `<@&${TIER_1_ROLE_ID}>\nThe scoreboard has now been reset! Thank you for all of your donations. ` +
            `We have collected ⏣ ${formatNumber(weeklyDonations)} coins this week, making the total ⏣ ${formatNumber(statsData.totalDonations)}. ` +
            `Keep up the great work.\nCongratulations to any promoted members and good luck for the next week.\n` +
            `You can now send your new requirements in <#${TRANSACTION_CHANNEL_ID}> according to your level!!`
        );
        await announcementChannel.send({ embeds: [weeklyStatsEmbed] });

        // ── Remove Pro Maker from everyone who has it ─────────────────────────
        try {
            console.log('[RESET] Removing Pro Maker roles');
            for (const [, member] of members) {
                if (member.roles.cache.has(PRO_MAKER_ROLE_ID)) {
                    await member.roles.remove(PRO_MAKER_ROLE_ID).catch(console.error);
                }
            }
        } catch (e) {
            console.error('[RESET] Error removing Pro Maker roles:', e);
            await announcementChannel.send(
                '<:xmark:934659388386451516> There was an issue updating Pro Money Maker roles. Please notify an admin.'
            ).catch(() => {});
        }

        // ── Give Pro Maker to top donor ───────────────────────────────────────
        try {
            if (topDonor) {
                const topDonorMember = members.get(topDonor) ?? null;
                if (topDonorMember) {
                    await topDonorMember.roles.add(PRO_MAKER_ROLE_ID);
                    const wasTie = topDonors.length > 1;

                    await announcementChannel.send({ embeds: [
                        new EmbedBuilder()
                            .setTitle('<:winners:1000018706874781806>  Pro Money Maker of the Week')
                            .setColor('#4c00b0')
                            .setDescription(
                                `> Congratulations to <@${topDonor}> for being the top donor this week with ⏣ ${formatNumber(topDonation)}! ` +
                                `They will keep the <@&${PRO_MAKER_ROLE_ID}> role for the next week.` +
                                (wasTie ? `\n> *There was a tie! <@${topDonor}> was selected as they donated first.*` : '')
                            )
                            .setTimestamp(),
                    ]});
                }
            }
        } catch (e) {
            console.error('[RESET] Error processing top donor:', e);
            await announcementChannel.send(
                `<:xmark:934659388386451516> There was an issue announcing the Pro Money Maker. ` +
                (topDonor ? `Congratulations to <@${topDonor}> with ⏣ ${formatNumber(topDonation)}!` : 'No top donor found.')
            ).catch(() => {});
        }

        // ── Promotions & demotions ────────────────────────────────────────────
        for (const [userId, userData] of Object.entries(usersData)) {
            const member = members.get(userId) ?? null;

            if (!member) {
                // User left server — reset their weekly but keep their record
                userData.weeklyDonated = 0;
                continue;
            }

            const isTier2 = member.roles.cache.has(TIER_2_ROLE_ID);
            const isTier1 = member.roles.cache.has(TIER_1_ROLE_ID);

            // Tier 1 → Tier 2 promotion
            if (isTier1 && !isTier2 && userData.weeklyDonated >= TIER_2_REQUIREMENT) {
                await member.roles.add(TIER_2_ROLE_ID).catch(console.error);
                promotionUserIds.push(userId);
                summary.promotions.push({ userId, donated: userData.weeklyDonated, newTier: 2 });
            }

            // Tier 2 demotion → Tier 1
            else if (isTier2 && userData.weeklyDonated < TIER_2_REQUIREMENT) {
                await member.roles.remove(TIER_2_ROLE_ID).catch(console.error);
                summary.demotions.push({
                    userId,
                    fromTier: 2,
                    toTier:   1,
                    missedBy: TIER_2_REQUIREMENT - userData.weeklyDonated,
                });
                await member.send({ embeds: [
                    new EmbedBuilder()
                        .setTitle('<:xmark:934659388386451516> Weekly Requirement Not Met')
                        .setColor('#ff0000')
                        .setDescription(
                            `You didn't meet this week's Tier 2 requirement.\n\n` +
                            `You have been demoted to Tier 1 and will start fresh with the standard Tier 1 requirement of ⏣ ${formatNumber(TIER_1_REQUIREMENT)}.`
                        )
                        .setTimestamp(),
                ]}).catch(() => { /* DMs closed */ });
            }

            // Tier 1 demotion → removed from system
            else if (isTier1 && !isTier2 && userData.weeklyDonated < TIER_1_REQUIREMENT) {
                await member.roles.remove(TIER_1_ROLE_ID).catch(console.error);
                summary.demotions.push({
                    userId,
                    fromTier: 1,
                    toTier:   0,
                    missedBy: TIER_1_REQUIREMENT - userData.weeklyDonated,
                });
                await member.send({ embeds: [
                    new EmbedBuilder()
                        .setTitle('<:xmark:934659388386451516> Weekly Requirement Not Met')
                        .setColor('#ff0000')
                        .setDescription(
                            `You missed the Tier 1 requirement by ⏣ ${formatNumber(TIER_1_REQUIREMENT - userData.weeklyDonated)}.\n\n` +
                            `You have been removed from the Money Makers team. If you wish to rejoin, please wait for a week and then DM faiz to restart at Tier 1.`
                        )
                        .setTimestamp(),
                ]}).catch(() => { /* DMs closed */ });

                delete usersData[userId];
                continue; // entry deleted — skip weeklyDonated reset below
            }

            userData.weeklyDonated = 0;
        }

        // ── Promotion announcement ────────────────────────────────────────────
        if (promotionUserIds.length > 0) {
            await announcementChannel.send({ embeds: [
                new EmbedBuilder()
                    .setTitle('<:power:1064835342160625784>  Promotions')
                    .setColor('#4c00b0')
                    .setDescription(
                        'These users have fulfilled the requirement to move up a level. They are promoted to Tier 2:\n\n' +
                        promotionUserIds.map(id => `<:aquadot:860074237954883585> <@${id}>`).join('\n')
                    )
                    .setTimestamp(),
            ]});
        }

        // ── Save data (must happen BEFORE updating the leaderboard) ───────────
        saveUsers(usersData);
        saveStats(statsData);
        console.log('[RESET] Data saved');

        // ── Admin summary embed ───────────────────────────────────────────────
        const summaryEmbed = new EmbedBuilder()
            .setTitle('<:lbtest:1064919048242090054> Weekly Reset Summary')
            .setColor('#4c00b0')
            .setTimestamp()
            .addFields({
                name:  '📊 Weekly Statistics',
                value: `Total Weekly Donations: ⏣ ${formatNumber(weeklyDonations)}\nTotal Server Donations: ⏣ ${formatNumber(statsData.totalDonations)}`,
            });

        if (tier2Users.length > 0) {
            summaryEmbed.addFields({
                name:  '<:streak:1064909945373458522> Tier 2 Weekly Performance',
                value: tier2Users.map((u, i) =>
                    `\`${i + 1}.\` <@${u.id}> ⏣ ${formatNumber(u.weeklyDonated)}/${formatNumber(u.requirement)}`
                ).join('\n'),
            });
        }

        if (tier1Users.length > 0) {
            summaryEmbed.addFields({
                name:  '<:YJ_streak:1259258046924853421> Tier 1 Weekly Performance',
                value: tier1Users.map((u, i) =>
                    `\`${i + 1}.\` <@${u.id}> ⏣ ${formatNumber(u.weeklyDonated)}/${formatNumber(u.requirement)}`
                ).join('\n'),
            });
        }

        if (summary.demotions.length > 0) {
            summaryEmbed.addFields({
                name:  '<:xmark:934659388386451516> Demotions',
                value: summary.demotions.map(d =>
                    `> <@${d.userId}> (Tier ${d.fromTier} → ${d.toTier})\n> Missed by ⏣ ${formatNumber(d.missedBy)}`
                ).join('\n\n'),
            });
        }

        if (summary.promotions.length > 0) {
            summaryEmbed.addFields({
                name:  '<:purpledot:860074414853586984>  Promotions',
                value: summary.promotions.map(p =>
                    `> <@${p.userId}> → Tier ${p.newTier}\n> Donated: ⏣ ${formatNumber(p.donated)}`
                ).join('\n\n'),
            });
        }

        await adminChannel.send({ embeds: [summaryEmbed] });

        // ── Donation logging commands for admin ───────────────────────────────
        const donationSyntaxes = [
            ...tier1Donations.filter(d => d.donated > 0).map(d =>
                `/dono add user: ${d.id} amount: ${formatNumber(d.donated)}`
            ),
            ...tier2Donations.filter(d => d.donated > 0).map(d =>
                `/dono add user: ${d.id} amount: ${formatNumber(Math.floor(d.donated * 1.25))}`
            ),
        ];

        if (donationSyntaxes.length > 0) {
            // Chunk to stay under Discord's 1024 char field limit
            const chunks = [];
            let current  = '';
            for (const line of donationSyntaxes) {
                if ((current + '\n' + line).length > 1000) {
                    chunks.push(current);
                    current = line;
                } else {
                    current = current ? current + '\n' + line : line;
                }
            }
            if (current) chunks.push(current);

            for (let i = 0; i < chunks.length; i++) {
                await adminChannel.send({ embeds: [
                    new EmbedBuilder()
                        .setTitle(`<:purpledot:860074414853586984> Donation Logging Syntaxes${chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ''}`)
                        .setColor('#4c00b0')
                        .setDescription('Use these commands to log donations:\n*Tier 1: Original amount | Tier 2: 1.25x multiplier*')
                        .addFields({ name: 'Commands', value: chunks[i] })
                        .setTimestamp(),
                ]});
            }
        }

        // ── Delete old leaderboard and post a fresh one ───────────────────────
        try {
            const activityChannel = await client.channels.fetch(ACTIVITY_CHANNEL_ID);
            const messages        = await activityChannel.messages.fetch({ limit: 20 });
            const old             = messages.find(m =>
                m.author.id === client.user.id &&
                m.embeds[0]?.title?.includes('Weekly Donations Leaderboard')
            );
            if (old) await old.delete();
            await updateStatusBoard(client);
            console.log('[RESET] Status board refreshed');
        } catch (e) {
            console.error('[RESET] Error refreshing status board:', e);
            await adminChannel.send(
                '<:xmark:934659388386451516> There was an error updating the status board during weekly reset.'
            ).catch(() => {});
        }

        console.log('[RESET] Weekly reset completed successfully');
        return true;

    } catch (e) {
        console.error('[RESET] Critical error:', e);
        try {
            const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID);
            await adminChannel.send(
                `<:xmark:934659388386451516> **CRITICAL ERROR DURING WEEKLY RESET**\n\`\`\`\n${e.message}\n\`\`\`\nPlease check logs and consider running \`,resetweekly\` manually.`
            );
        } catch { /* can't notify */ }
        return false;
    }
}

module.exports = { weeklyReset };
