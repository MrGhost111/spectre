const { PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/channels.json');
const BACKUP_DIR = path.join(__dirname, '../data/backups');

function isSnowflake(str) {
    return typeof str === 'string' && /^\d{17,19}$/.test(str);
}

function snowflakeAge(id) {
    try {
        const ms = Number(BigInt(id) >> 22n) + 1420070400000;
        return `<t:${Math.floor(ms / 1000)}:D>`;
    } catch { return 'unknown'; }
}

/** Try to fetch a real guild member. Returns member or null. */
async function fetchMember(guild, userId) {
    if (!isSnowflake(userId)) return null;
    return guild.members.fetch(userId).catch(() => null);
}

/** Try to fetch a real guild channel. Returns channel or null. */
async function fetchChannel(guild, channelId) {
    if (!isSnowflake(channelId)) return null;
    return guild.channels.fetch(channelId).catch(() => null);
}

/** Merge two friends arrays — union, deduplicated, owner excluded, snowflakes only */
function mergeFriends(a, b, ownerId) {
    return [...new Set([...(a || []), ...(b || [])])].filter(
        id => isSnowflake(id) && id !== ownerId
    );
}

/**
 * Collect a single message from the same author in the same channel,
 * with a timeout. Returns the message content string or null on timeout.
 */
function awaitReply(message, timeoutMs = 60_000) {
    return new Promise(resolve => {
        const filter = m => m.author.id === message.author.id && m.channel.id === message.channel.id;
        const collector = message.channel.createMessageCollector({ filter, max: 1, time: timeoutMs });
        collector.on('collect', m => resolve(m.content.trim()));
        collector.on('end', collected => { if (collected.size === 0) resolve(null); });
    });
}

/** Send an embed and wait for a numeric choice. Returns chosen number or null. */
async function askChoice(message, embed, validChoices, timeoutMs = 60_000) {
    await message.channel.send({ embeds: [embed] });
    while (true) {
        const reply = await awaitReply(message, timeoutMs);
        if (reply === null) return null; // timed out
        const n = parseInt(reply, 10);
        if (validChoices.includes(n)) return n;
        await message.channel.send(`Please reply with one of: ${validChoices.join(', ')}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    name: 'fixdata',
    description: 'Admin command to interactively audit and repair channels.json',
    async execute(message, args) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('This command is only available to admins.');
        }

        const guild = message.guild;

        // ── 1. Backup ────────────────────────────────────────────────────────
        if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(BACKUP_DIR, `channels-${timestamp}.json`);
        fs.copyFileSync(DATA_PATH, backupPath);

        // ── 2. Load ──────────────────────────────────────────────────────────
        let raw;
        try {
            raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
        } catch (err) {
            return message.reply(`❌ Failed to parse channels.json: ${err.message}`);
        }

        await message.reply({
            embeds: [new EmbedBuilder()
                .setColor(Colors.Blurple)
                .setTitle('Data audit started')
                .setDescription(
                    `Backup saved to \`data/backups/channels-${timestamp}.json\`\n\n` +
                    `I'll go through each issue one by one and ask what to do.\n` +
                    `You'll have **60 seconds** to respond to each prompt.\n\n` +
                    `Scanning ${Object.keys(raw).length} entries...`
                )]
        });

        // ── 3. Validate every raw entry, resolve to a normalised list ─────────
        // Each item: { key, entry, userValid, channelValid, keyMatchesUserId }
        const scanning = await message.channel.send('🔍 Validating users and channels with Discord...');

        const entries = [];
        for (const [key, entry] of Object.entries(raw)) {
            if (key === 'channels') continue; // drop legacy array key silently
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;

            const userValid = isSnowflake(entry.userId) ? !!(await fetchMember(guild, entry.userId)) : false;
            const channelValid = isSnowflake(entry.channelId) ? !!(await fetchChannel(guild, entry.channelId)) : false;
            const keyValid = isSnowflake(key) ? !!(await fetchMember(guild, key)) : false;
            const keyMatchesUserId = key === entry.userId;

            entries.push({ key, entry, userValid, channelValid, keyMatchesUserId, keyValid });
        }

        await scanning.delete().catch(() => { });

        // ── 4. Work through issues interactively ─────────────────────────────
        // We build the final map as we go: userId → entry
        const resolved = new Map(); // userId → clean entry
        const usedChannels = new Map(); // channelId → userId

        let issueNum = 0;

        for (let i = 0; i < entries.length; i++) {
            let { key, entry, userValid, channelValid, keyMatchesUserId, keyValid } = entries[i];

            // ── Case A: both userId and channelId are completely invalid ──────
            if (!userValid && !channelValid) {
                issueNum++;
                await message.channel.send({
                    embeds: [new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setTitle(`Issue #${issueNum} — Both IDs invalid, entry removed`)
                        .setDescription(
                            `**JSON key:** \`${key}\`\n` +
                            `**userId:** \`${entry.userId}\` — ❌ not found on server\n` +
                            `**channelId:** \`${entry.channelId}\` — ❌ not found on server\n\n` +
                            `There is nothing salvageable here. This entry will be automatically removed.`
                        )]
                });
                continue; // skip — don't add to resolved
            }

            // ── Case B: key doesn't match userId ─────────────────────────────
            // Figure out the canonical userId. Trust entry.userId if it's the
            // valid one; otherwise fall back to key if key is a valid user.
            let canonicalUserId = entry.userId;
            if (!keyMatchesUserId) {
                issueNum++;
                const e = new EmbedBuilder()
                    .setColor(Colors.Yellow)
                    .setTitle(`Issue #${issueNum} — Key/userId mismatch`)
                    .setDescription(
                        `The JSON key and the \`userId\` field inside this entry don't match.\n\n` +
                        `**JSON key:** \`${key}\` ${keyValid ? `(<@${key}> ✅ real user)` : '❌ not found on server'}\n` +
                        `**userId field:** \`${entry.userId}\` ${userValid ? `(<@${entry.userId}> ✅ real user)` : '❌ not found on server'}\n` +
                        `**channelId:** \`${entry.channelId}\` ${channelValid ? `(<#${entry.channelId}> ✅ real channel)` : '❌ not found on server'}\n` +
                        `**Friends:** ${entry.friends?.length ?? 0} entries\n\n` +
                        (userValid && keyValid
                            ? `Both IDs resolve to real users. Who is the real owner of <#${entry.channelId}>?\n\`1\` → Keep \`${entry.userId}\` (<@${entry.userId}>)\n\`2\` → Keep \`${key}\` (<@${key}>)`
                            : userValid
                                ? `Only \`userId\` field (<@${entry.userId}>) is a real user — will be re-keyed to that automatically.\n\nReply \`ok\` to confirm.`
                                : `Only the JSON key (<@${key}>) is a real user — will use that as the userId.\n\nReply \`ok\` to confirm.`
                        )
                    );

                if (userValid && keyValid) {
                    const choice = await askChoice(message, e, [1, 2]);
                    if (choice === null) return message.channel.send('⏱️ Timed out. No changes were written.');
                    canonicalUserId = choice === 1 ? entry.userId : key;
                } else {
                    await message.channel.send({ embeds: [e] });
                    const reply = await awaitReply(message);
                    if (reply === null) return message.channel.send('⏱️ Timed out. No changes were written.');
                    canonicalUserId = userValid ? entry.userId : key;
                }

                // Update validity to match what we resolved
                userValid = true;
                entry = { ...entry, userId: canonicalUserId };
            }

            // ── Case C: channel doesn't exist on server ───────────────────────
            if (!channelValid) {
                issueNum++;
                await message.channel.send({
                    embeds: [new EmbedBuilder()
                        .setColor(Colors.Orange)
                        .setTitle(`Issue #${issueNum} — Channel not found`)
                        .setDescription(
                            `**Owner:** <@${canonicalUserId}> (\`${canonicalUserId}\`) ✅\n` +
                            `**channelId:** \`${entry.channelId}\` ❌ — this channel no longer exists on the server\n` +
                            `**Friends:** ${entry.friends?.length ?? 0} entries\n\n` +
                            `The channel is gone. This entry will be automatically removed.\n` +
                            `If the channel was re-created, use \`/assign\` to reassign it to this user.`
                        )]
                });
                continue;
            }

            // ── Case D: this userId already has a resolved entry ──────────────
            if (resolved.has(canonicalUserId)) {
                issueNum++;
                const existing = resolved.get(canonicalUserId);
                const sameChannel = existing.channelId === entry.channelId;

                if (sameChannel) {
                    // Same user, same channel — just merge friends, no question needed
                    const merged = mergeFriends(existing.friends, entry.friends, canonicalUserId);
                    resolved.set(canonicalUserId, { ...existing, friends: merged });
                    await message.channel.send({
                        embeds: [new EmbedBuilder()
                            .setColor(Colors.Green)
                            .setTitle(`Issue #${issueNum} — Duplicate entry for same user+channel (auto-merged)`)
                            .setDescription(
                                `**User:** <@${canonicalUserId}>\n` +
                                `**Channel:** <#${entry.channelId}>\n\n` +
                                `Both entries point to the same channel — friends lists merged automatically.\n` +
                                `Entry 1 had **${existing.friends?.length ?? 0}** friends, entry 2 had **${entry.friends?.length ?? 0}** friends → now **${merged.length}** unique friends.`
                            )]
                    });
                } else {
                    // Same user, different channels — ask which channel they actually own
                    const ch1Valid = !!(await fetchChannel(guild, existing.channelId));
                    const ch2Valid = !!(await fetchChannel(guild, entry.channelId));

                    let desc =
                        `**User:** <@${canonicalUserId}>\n\n` +
                        `This user has two entries pointing to different channels:\n\n` +
                        `**Entry 1**\n` +
                        `  Channel: \`${existing.channelId}\` ${ch1Valid ? `<#${existing.channelId}> ✅` : '❌ not found'}\n` +
                        `  Created: ${snowflakeAge(existing.channelId)}\n` +
                        `  Friends: ${existing.friends?.length ?? 0}\n\n` +
                        `**Entry 2**\n` +
                        `  Channel: \`${entry.channelId}\` ${ch2Valid ? `<#${entry.channelId}> ✅` : '❌ not found'}\n` +
                        `  Created: ${snowflakeAge(entry.channelId)}\n` +
                        `  Friends: ${entry.friends?.length ?? 0}\n\n`;

                    if (ch1Valid && !ch2Valid) {
                        desc += `Entry 2's channel doesn't exist — keeping Entry 1 automatically and merging any friends.`;
                        const merged = mergeFriends(existing.friends, entry.friends, canonicalUserId);
                        resolved.set(canonicalUserId, { ...existing, friends: merged });
                        await message.channel.send({
                            embeds: [new EmbedBuilder()
                                .setColor(Colors.Orange)
                                .setTitle(`Issue #${issueNum} — Duplicate user, one channel missing (auto-resolved)`)
                                .setDescription(desc)]
                        });
                    } else if (!ch1Valid && ch2Valid) {
                        desc += `Entry 1's channel doesn't exist — keeping Entry 2 automatically and merging any friends.`;
                        const merged = mergeFriends(existing.friends, entry.friends, canonicalUserId);
                        usedChannels.delete(existing.channelId);
                        resolved.set(canonicalUserId, { ...entry, userId: canonicalUserId, friends: merged });
                        usedChannels.set(entry.channelId, canonicalUserId);
                        await message.channel.send({
                            embeds: [new EmbedBuilder()
                                .setColor(Colors.Orange)
                                .setTitle(`Issue #${issueNum} — Duplicate user, one channel missing (auto-resolved)`)
                                .setDescription(desc)]
                        });
                    } else {
                        desc += `Both channels exist. Which channel does this user actually own?\n` +
                            `\`1\` → Keep Entry 1 (<#${existing.channelId}>)\n` +
                            `\`2\` → Keep Entry 2 (<#${entry.channelId}>)\n\n` +
                            `Friends from both entries will be merged into the chosen one.`;
                        const choice = await askChoice(message,
                            new EmbedBuilder().setColor(Colors.Yellow)
                                .setTitle(`Issue #${issueNum} — Duplicate user, two valid channels`)
                                .setDescription(desc),
                            [1, 2]
                        );
                        if (choice === null) return message.channel.send('⏱️ Timed out. No changes were written.');
                        const merged = mergeFriends(existing.friends, entry.friends, canonicalUserId);
                        if (choice === 1) {
                            resolved.set(canonicalUserId, { ...existing, friends: merged });
                        } else {
                            usedChannels.delete(existing.channelId);
                            resolved.set(canonicalUserId, { ...entry, userId: canonicalUserId, friends: merged });
                            usedChannels.set(entry.channelId, canonicalUserId);
                        }
                    }
                }
                continue;
            }

            // ── Case E: this channelId is already claimed by another user ─────
            if (usedChannels.has(entry.channelId)) {
                issueNum++;
                const otherUserId = usedChannels.get(entry.channelId);
                const otherEntry = resolved.get(otherUserId);

                const user1Valid = !!(await fetchMember(guild, otherUserId));
                const user2Valid = !!(await fetchMember(guild, canonicalUserId));

                let desc =
                    `**Channel:** <#${entry.channelId}> (\`${entry.channelId}\`)\n\n` +
                    `Two different users both have this channel in their entry:\n\n` +
                    `**User 1:** \`${otherUserId}\` ${user1Valid ? `<@${otherUserId}> ✅` : '❌ not found on server'}\n` +
                    `  Friends: ${otherEntry?.friends?.length ?? 0}\n\n` +
                    `**User 2:** \`${canonicalUserId}\` ${user2Valid ? `<@${canonicalUserId}> ✅` : '❌ not found on server'}\n` +
                    `  Friends: ${entry.friends?.length ?? 0}\n\n`;

                let winnerUserId, winnerEntry;

                if (user1Valid && !user2Valid) {
                    desc += `User 2 is not on the server — keeping User 1 automatically and merging any friends.`;
                    const merged = mergeFriends(otherEntry?.friends, entry.friends, otherUserId);
                    winnerUserId = otherUserId;
                    winnerEntry = { ...otherEntry, friends: merged };
                    await message.channel.send({
                        embeds: [new EmbedBuilder()
                            .setColor(Colors.Orange)
                            .setTitle(`Issue #${issueNum} — Channel claimed by two users (auto-resolved)`)
                            .setDescription(desc)]
                    });
                } else if (!user1Valid && user2Valid) {
                    desc += `User 1 is not on the server — keeping User 2 automatically and merging any friends.`;
                    const merged = mergeFriends(otherEntry?.friends, entry.friends, canonicalUserId);
                    winnerUserId = canonicalUserId;
                    winnerEntry = { ...entry, userId: canonicalUserId, friends: merged };
                    await message.channel.send({
                        embeds: [new EmbedBuilder()
                            .setColor(Colors.Orange)
                            .setTitle(`Issue #${issueNum} — Channel claimed by two users (auto-resolved)`)
                            .setDescription(desc)]
                    });
                } else {
                    desc += `Both users are on the server. Who is the real owner of <#${entry.channelId}>?\n` +
                        `\`1\` → <@${otherUserId}> (User 1)\n` +
                        `\`2\` → <@${canonicalUserId}> (User 2)\n\n` +
                        `The other user's entry will be removed, but their friends will be merged in.`;
                    const choice = await askChoice(message,
                        new EmbedBuilder().setColor(Colors.Yellow)
                            .setTitle(`Issue #${issueNum} — Channel claimed by two valid users`)
                            .setDescription(desc),
                        [1, 2]
                    );
                    if (choice === null) return message.channel.send('⏱️ Timed out. No changes were written.');
                    const merged = mergeFriends(otherEntry?.friends, entry.friends,
                        choice === 1 ? otherUserId : canonicalUserId);
                    if (choice === 1) {
                        winnerUserId = otherUserId;
                        winnerEntry = { ...otherEntry, friends: merged };
                    } else {
                        winnerUserId = canonicalUserId;
                        winnerEntry = { ...entry, userId: canonicalUserId, friends: merged };
                        resolved.delete(otherUserId);
                    }
                }

                usedChannels.delete(entry.channelId);
                resolved.set(winnerUserId, winnerEntry);
                usedChannels.set(entry.channelId, winnerUserId);
                continue;
            }

            // ── No issues — clean entry, just normalise and store ─────────────
            const friends = mergeFriends(entry.friends, [], canonicalUserId);
            resolved.set(canonicalUserId, {
                userId: canonicalUserId,
                channelId: entry.channelId,
                friends,
                ...(entry.createdAt && !isNaN(Date.parse(entry.createdAt)) ? { createdAt: entry.createdAt } : {}),
            });
            usedChannels.set(entry.channelId, canonicalUserId);
        }

        // ── 5. Final summary ──────────────────────────────────────────────────
        const totalBefore = Object.keys(raw).filter(k => k !== 'channels').length;
        const totalAfter = resolved.size;
        const cleaned = Object.fromEntries(resolved);

        const summaryEmbed = new EmbedBuilder()
            .setColor(issueNum === 0 ? Colors.Green : Colors.Orange)
            .setTitle('Audit complete')
            .addFields(
                { name: 'Issues found', value: String(issueNum), inline: true },
                { name: 'Entries before', value: String(totalBefore), inline: true },
                { name: 'Entries after', value: String(totalAfter), inline: true },
                { name: 'Backup', value: `\`data/backups/channels-${timestamp}.json\``, inline: false },
            )
            .setDescription(
                issueNum === 0
                    ? '✅ No issues found — data is clean. Nothing to write.'
                    : `All ${issueNum} issues resolved.\n\nReply \`save\` to write the fixed data, or \`cancel\` to discard.`
            );

        await message.channel.send({ embeds: [summaryEmbed] });

        if (issueNum === 0) return;

        // Ask to save
        const confirm = await awaitReply(message, 60_000);
        if (confirm === null || confirm.toLowerCase() !== 'save') {
            return message.channel.send('❌ Cancelled — no changes written. Your backup is safe.');
        }

        fs.writeFileSync(DATA_PATH, JSON.stringify(cleaned, null, 2), 'utf8');
        await message.channel.send({
            embeds: [new EmbedBuilder()
                .setColor(Colors.Green)
                .setDescription(`✅ channels.json saved with **${totalAfter}** clean entries.`)
            ]
        });
    },
};