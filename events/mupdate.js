const { EmbedBuilder, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ─── Constants ───────────────────────────────────────────────────────────────
const ANNOUNCEMENT_CHANNEL_ID = '833241820959473724';
const ACTIVITY_CHANNEL_ID = '1327928516662005770';
const TRANSACTION_CHANNEL_ID = '833246120389902356';
const ADMIN_CHANNEL_ID = '966598961353850910';
const DANK_MEMER_BOT_ID = '270904126974590976';

const TIER_1_ROLE_ID = '783032959350734868';
const TIER_2_ROLE_ID = '1038888209440067604';
const PRO_MAKER_ROLE_ID = '838478632451178506';

const TIER_1_REQUIREMENT = 35000000;
const TIER_2_REQUIREMENT = 70000000;

const usersFilePath = path.join(__dirname, '../data/users.json');
const statsFilePath = path.join(__dirname, '../data/stats.json');

// ─── Disk I/O (always fresh, no in-memory state) ─────────────────────────────
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

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

// ─── Status Board ─────────────────────────────────────────────────────────────
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

        const messages = await activityChannel.messages.fetch({ limit: 10 });
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

// ─── Weekly Stats ─────────────────────────────────────────────────────────────
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

// ─── Weekly Reset ─────────────────────────────────────────────────────────────
async function weeklyReset(client) {
    try {
        console.log('[RESET] Starting weekly reset');

        // Always load fresh from disk
        const usersData = loadUsers();
        const statsData = loadStats();

        const guild = client.guilds.cache.first();
        const announcementChannel = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
        const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID);

        const summary = { promotions: [], demotions: [] };
        let weeklyDonations = 0;
        let topDonors = [];
        let topDonation = 0;
        const tier1Donations = [];
        const tier2Donations = [];
        const promotionUserIds = [];

        // Fetch all members once
        console.log('[RESET] Fetching guild members...');
        const members = await guild.members.fetch({ force: true, time: 45000 });
        console.log(`[RESET] Fetched ${members.size} members`);

        // Build donation totals and find top donor
        for (const [userId, userData] of Object.entries(usersData)) {
            weeklyDonations += userData.weeklyDonated || 0;

            if (userData.weeklyDonated > topDonation) {
                topDonors = [{ id: userId, donation: userData.weeklyDonated, timestamp: userData.lastDonation || new Date().toISOString() }];
                topDonation = userData.weeklyDonated;
            } else if (userData.weeklyDonated === topDonation && topDonation > 0) {
                topDonors.push({ id: userId, donation: userData.weeklyDonated, timestamp: userData.lastDonation || new Date().toISOString() });
            }
        }

        // Earliest donor wins ties
        topDonors.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const topDonor = topDonors[0]?.id ?? null;

        statsData.totalDonations += weeklyDonations;

        // Collect tier donation lists for admin embed
        for (const [memberId, member] of members) {
            const hasTier1 = member.roles.cache.has(TIER_1_ROLE_ID);
            const hasTier2 = member.roles.cache.has(TIER_2_ROLE_ID);
            const donated = usersData[memberId]?.weeklyDonated || 0;
            if (donated === 0) continue;

            if (hasTier2) tier2Donations.push({ id: memberId, donated });
            else if (hasTier1) tier1Donations.push({ id: memberId, donated });
        }

        // ── Weekly stats embed ────────────────────────────────────────────────
        const { tier1Users, tier2Users } = await getWeeklyStats(client);

        const weeklyStatsEmbed = new EmbedBuilder()
            .setTitle('<:lbtest:1064919048242090054>  Weekly Stats')
            .setColor('#4c00b0')
            .setDescription('Here is how our Money Makers performed this week:');

        if (tier2Users.length > 0) {
            weeklyStatsEmbed.addFields({
                name: '<:streak:1064909945373458522>  Tier 2',
                value: tier2Users.map((u, i) =>
                    `\`${i + 1}.\` <@${u.id}> ⏣ ${formatNumber(u.weeklyDonated)}/${formatNumber(u.requirement)}`
                ).join('\n'),
            });
        }

        if (tier1Users.length > 0) {
            weeklyStatsEmbed.addFields({
                name: '<:YJ_streak:1259258046924853421>  Tier 1',
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

        // ── Pro Maker role — remove from everyone ─────────────────────────────
        try {
            console.log('[RESET] Removing Pro Maker roles');
            for (const [, member] of members) {
                if (member.roles.cache.has(PRO_MAKER_ROLE_ID)) {
                    await member.roles.remove(PRO_MAKER_ROLE_ID).catch(console.error);
                }
            }
        } catch (e) {
            console.error('[RESET] Error removing Pro Maker roles:', e);
            await announcementChannel.send('<:xmark:934659388386451516> There was an issue updating Pro Money Maker roles. Please notify an admin.').catch(() => { });
        }

        // ── Pro Maker role — give to top donor ────────────────────────────────
        try {
            if (topDonor) {
                const topDonorMember = members.get(topDonor) || await guild.members.fetch(topDonor).catch(() => null);
                if (topDonorMember) {
                    await topDonorMember.roles.add(PRO_MAKER_ROLE_ID);
                    const wasTie = topDonors.length > 1;

                    const topDonorEmbed = new EmbedBuilder()
                        .setTitle('<:winners:1000018706874781806>  Pro Money Maker of the Week')
                        .setColor('#4c00b0')
                        .setDescription(
                            `> Congratulations to <@${topDonor}> for being the top donor this week with ⏣ ${formatNumber(topDonation)}! ` +
                            `They will keep the <@&${PRO_MAKER_ROLE_ID}> role for the next week.` +
                            (wasTie ? `\n> *There was a tie! <@${topDonor}> was selected as they donated first.*` : '')
                        )
                        .setTimestamp();

                    await announcementChannel.send({ embeds: [topDonorEmbed] });
                }
            }
        } catch (e) {
            console.error('[RESET] Error processing top donor:', e);
            await announcementChannel.send(
                `<:xmark:934659388386451516> There was an issue announcing the Pro Money Maker of the week. ` +
                (topDonor ? `Congratulations to <@${topDonor}> with ⏣ ${formatNumber(topDonation)}!` : 'No top donor found this week.')
            ).catch(() => { });
        }

        // ── Promotions & demotions ────────────────────────────────────────────
        for (const [userId, userData] of Object.entries(usersData)) {
            const member = members.get(userId) || await guild.members.fetch(userId).catch(() => null);
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

            // Tier 2 demotion
            else if (isTier2 && userData.weeklyDonated < TIER_2_REQUIREMENT) {
                await member.roles.remove(TIER_2_ROLE_ID).catch(console.error);
                summary.demotions.push({
                    userId,
                    fromTier: 2,
                    toTier: 1,
                    missedBy: TIER_2_REQUIREMENT - userData.weeklyDonated,
                });
                try {
                    await member.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('<:xmark:934659388386451516> Weekly Requirement Not Met')
                                .setColor('#ff0000')
                                .setDescription(
                                    `You didn't meet this week's Tier 2 requirement.\n\n` +
                                    `You have been demoted to Tier 1 and will start fresh with the standard Tier 1 requirement of ⏣ ${formatNumber(TIER_1_REQUIREMENT)}.`
                                )
                                .setTimestamp(),
                        ]
                    });
                } catch { /* DMs closed */ }
            }

            // Tier 1 demotion — missed requirement → remove role, delete from system
            else if (isTier1 && !isTier2 && userData.weeklyDonated < TIER_1_REQUIREMENT) {
                await member.roles.remove(TIER_1_ROLE_ID).catch(console.error);
                summary.demotions.push({
                    userId,
                    fromTier: 1,
                    toTier: 0,
                    missedBy: TIER_1_REQUIREMENT - userData.weeklyDonated,
                });
                try {
                    await member.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('<:xmark:934659388386451516> Weekly Requirement Not Met')
                                .setColor('#ff0000')
                                .setDescription(
                                    `You missed the Tier 1 requirement by ⏣ ${formatNumber(TIER_1_REQUIREMENT - userData.weeklyDonated)}.\n\n` +
                                    `You have been removed from the Money Makers team. If you wish to rejoin, please wait for a week and then DM faiz to restart at Tier 1.`
                                )
                                .setTimestamp(),
                        ]
                    });
                } catch { /* DMs closed */ }

                delete usersData[userId];
                continue; // Skip the weeklyDonated reset below since entry is deleted
            }

            userData.weeklyDonated = 0;
        }

        // ── Promotion announcement ────────────────────────────────────────────
        if (promotionUserIds.length > 0) {
            await announcementChannel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('<:power:1064835342160625784>  Promotions')
                        .setColor('#4c00b0')
                        .setDescription(
                            'These users have fulfilled the requirement to move up a level. They are promoted to Tier 2\n\n' +
                            promotionUserIds.map(id => `<:aquadot:860074237954883585> <@${id}>`).join('\n')
                        )
                        .setTimestamp(),
                ]
            });
        }

        // ── Admin summary ─────────────────────────────────────────────────────
        const summaryEmbed = new EmbedBuilder()
            .setTitle('<:lbtest:1064919048242090054> Weekly Reset Summary')
            .setColor('#4c00b0')
            .setTimestamp()
            .addFields({
                name: '📊 Weekly Statistics',
                value: `Total Weekly Donations: ⏣ ${formatNumber(weeklyDonations)}\nTotal Server Donations: ⏣ ${formatNumber(statsData.totalDonations)}`,
            });

        if (tier2Users.length > 0) {
            summaryEmbed.addFields({
                name: '<:streak:1064909945373458522> Tier 2 Weekly Performance',
                value: tier2Users.map((u, i) =>
                    `\`${i + 1}.\` <@${u.id}> ⏣ ${formatNumber(u.weeklyDonated)}/${formatNumber(u.requirement)}`
                ).join('\n'),
            });
        }

        if (tier1Users.length > 0) {
            summaryEmbed.addFields({
                name: '<:YJ_streak:1259258046924853421> Tier 1 Weekly Performance',
                value: tier1Users.map((u, i) =>
                    `\`${i + 1}.\` <@${u.id}> ⏣ ${formatNumber(u.weeklyDonated)}/${formatNumber(u.requirement)}`
                ).join('\n'),
            });
        }

        if (summary.demotions.length > 0) {
            summaryEmbed.addFields({
                name: '<:xmark:934659388386451516> Demotions',
                value: summary.demotions.map(d =>
                    `> <@${d.userId}> (Tier ${d.fromTier} → ${d.toTier})\n> Missed by ⏣ ${formatNumber(d.missedBy)}`
                ).join('\n\n'),
            });
        }

        if (summary.promotions.length > 0) {
            summaryEmbed.addFields({
                name: '<:purpledot:860074414853586984>  Promotions',
                value: summary.promotions.map(p =>
                    `> <@${p.userId}> → Tier ${p.newTier}\n> Donated: ⏣ ${formatNumber(p.donated)}`
                ).join('\n\n'),
            });
        }

        await adminChannel.send({ embeds: [summaryEmbed] });

        // ── Donation logging syntaxes for admin ───────────────────────────────
        const donationSyntaxes = [
            ...tier1Donations.filter(d => d.donated > 0).map(d =>
                `/dono add user: ${d.id} amount: ${formatNumber(d.donated)}`
            ),
            ...tier2Donations.filter(d => d.donated > 0).map(d =>
                `/dono add user: ${d.id} amount: ${formatNumber(Math.floor(d.donated * 1.25))}`
            ),
        ];

        if (donationSyntaxes.length > 0) {
            await adminChannel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('<:purpledot:860074414853586984> Donation Logging Syntaxes')
                        .setColor('#4c00b0')
                        .setDescription('Use these commands to log donations:\n*Tier 1: Original amount | Tier 2: 1.25x multiplier*')
                        .addFields({ name: 'Commands', value: donationSyntaxes.join('\n') })
                        .setTimestamp(),
                ]
            });
        }

        // ── Save & update board ───────────────────────────────────────────────
        saveUsers(usersData);
        saveStats(statsData);
        console.log('[RESET] Data saved');

        try {
            const activityChannel = await client.channels.fetch(ACTIVITY_CHANNEL_ID);
            const messages = await activityChannel.messages.fetch({ limit: 10 });
            const old = messages.find(m =>
                m.author.id === client.user.id &&
                m.embeds[0]?.title?.includes('Weekly Donations Leaderboard')
            );
            if (old) await old.delete();
            await updateStatusBoard(client);
            console.log('[RESET] Status board updated');
        } catch (e) {
            console.error('[RESET] Error updating status board:', e);
            await adminChannel.send('<:xmark:934659388386451516> There was an error updating the status board during weekly reset.').catch(() => { });
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
        } catch { /* cant notify */ }
        return false;
    }
}

// ─── Donation Detection (MessageUpdate event) ─────────────────────────────────
module.exports = {
    name: Events.MessageUpdate,
    weeklyReset,
    async execute(client, oldMessage, newMessage) {
        try {
            // Track edited messages for snipe purposes
            if (oldMessage.content && newMessage.content && oldMessage.content !== newMessage.content) {
                if (!client.editedMessages) client.editedMessages = new Map();
                const channelEdits = client.editedMessages.get(newMessage.channel.id) || [];
                if (channelEdits.length >= 50) channelEdits.shift();
                channelEdits.push({
                    author: newMessage.author?.tag,
                    oldContent: oldMessage.content,
                    newContent: newMessage.content,
                    timestamp: Math.floor(Date.now() / 1000),
                    messageId: newMessage.id,
                });
                client.editedMessages.set(newMessage.channel.id, channelEdits);
            }

            // Donation detection — Dank Memer in transaction channel only
            if (
                newMessage.channel?.id !== TRANSACTION_CHANNEL_ID ||
                newMessage.author?.id !== DANK_MEMER_BOT_ID
            ) return;

            if (!newMessage.embeds?.length) return;

            const embed = newMessage.embeds[0];
            if (!embed.description?.includes('Successfully donated')) return;

            const donationMatch = embed.description.match(/Successfully donated \*\*⏣\s*([\d,]+)\*\*/);
            if (!donationMatch) return;

            const donationAmount = parseInt(donationMatch[1].replace(/,/g, ''), 10);
            const donorId = await findCommandUser(newMessage);
            if (!donorId) {
                console.warn('[DONATION] Could not resolve donor ID');
                return;
            }

            const guild = client.guilds.cache.first();
            const member = await guild.members.fetch(donorId).catch(() => null);
            if (!member) {
                console.warn(`[DONATION] Member ${donorId} not found in guild`);
                return;
            }

            const currentTier = member.roles.cache.has(TIER_2_ROLE_ID) ? 2
                : member.roles.cache.has(TIER_1_ROLE_ID) ? 1
                    : 0;

            // Load fresh, update, save
            const usersData = loadUsers();
            const statsData = loadStats();

            if (!usersData[donorId]) {
                usersData[donorId] = {
                    totalDonated: 0,
                    weeklyDonated: 0,
                    currentTier,
                    status: 'good',
                    missedAmount: 0,
                    lastDonation: new Date().toISOString(),
                };
            }

            usersData[donorId].totalDonated = (usersData[donorId].totalDonated || 0) + donationAmount;
            usersData[donorId].weeklyDonated = (usersData[donorId].weeklyDonated || 0) + donationAmount;
            usersData[donorId].lastDonation = new Date().toISOString();
            usersData[donorId].currentTier = currentTier;

            statsData.totalDonations += donationAmount;

            saveUsers(usersData);
            saveStats(statsData);

            const requirement = currentTier === 2 ? TIER_2_REQUIREMENT : TIER_1_REQUIREMENT;

            const donationEmbed = new EmbedBuilder()
                .setTitle('<:prize:1000016483369369650>  New Donation')
                .setColor('#4c00b0')
                .setDescription(
                    `<@${donorId}> donated ⏣ ${formatNumber(donationAmount)}\n\n` +
                    `<:purpledot:860074414853586984>  Weekly Progress: ⏣ ${formatNumber(usersData[donorId].weeklyDonated)}/${formatNumber(requirement + (usersData[donorId].missedAmount || 0))}`
                )
                .setTimestamp();

            await newMessage.channel.send({ embeds: [donationEmbed] });

            // Update leaderboard in background so donation response is instant
            setImmediate(() => updateStatusBoard(client).catch(console.error));

        } catch (e) {
            console.error('[MUPDATE] Unhandled error in execute:', e);
        }
    },
};