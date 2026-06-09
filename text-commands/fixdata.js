// JavaScript source code
const { PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const DATA_PATH   = path.join(__dirname, '../data/channels.json');
const BACKUP_DIR  = path.join(__dirname, '../data/backups');

module.exports = {
    name: 'fixdata',
    description: 'Admin command to audit and repair channels.json',
    async execute(message, args) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('This command is only available to admins.');
        }

        const dryRun = !args.includes('--fix');

        // ── 1. Backup ────────────────────────────────────────────────────────
        if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

        const timestamp  = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(BACKUP_DIR, `channels-${timestamp}.json`);
        fs.copyFileSync(DATA_PATH, backupPath);

        // ── 2. Load ──────────────────────────────────────────────────────────
        let raw;
        try {
            raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
        } catch (err) {
            return message.reply(`Failed to parse channels.json: ${err.message}`);
        }

        // ── 3. Audit ─────────────────────────────────────────────────────────
        const issues   = [];   // human-readable issue strings
        const cleaned  = {};   // the fixed output we will write if --fix

        // Track which channelIds we have already seen to catch duplicates
        const seenChannels = new Map(); // channelId → userId of first valid entry

        for (const [key, entry] of Object.entries(raw)) {
            // Skip the legacy "channels" array that some older code left behind
            if (key === 'channels') {
                issues.push(`⚠️ Legacy \`channels\` array key found — will be removed`);
                continue;
            }

            // Must be a plain object
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                issues.push(`❌ Key \`${key}\`: not an object — will be removed`);
                continue;
            }

            // Required fields
            const missingFields = ['userId', 'channelId', 'createdAt'].filter(f => !entry[f]);
            if (missingFields.length) {
                issues.push(`❌ Key \`${key}\`: missing fields [${missingFields.join(', ')}] — will be removed`);
                continue;
            }

            // Key must match userId
            if (key !== entry.userId) {
                issues.push(`⚠️ Key \`${key}\` does not match userId \`${entry.userId}\` — key will be corrected to userId`);
                // We'll re-key it below; use entry.userId as the canonical key
            }

            const canonicalKey = entry.userId;

            // Duplicate userId (same user appears under two keys)
            if (cleaned[canonicalKey]) {
                issues.push(`❌ Duplicate userId \`${canonicalKey}\` — keeping first occurrence, discarding this one`);
                continue;
            }

            // Duplicate channelId (same channel assigned to two users)
            if (seenChannels.has(entry.channelId)) {
                const firstOwner = seenChannels.get(entry.channelId);
                issues.push(`❌ Channel \`${entry.channelId}\` assigned to both \`${firstOwner}\` and \`${canonicalKey}\` — keeping \`${firstOwner}\`, removing \`${canonicalKey}\``);
                continue;
            }

            // friends must be an array
            if (!Array.isArray(entry.friends)) {
                issues.push(`⚠️ Key \`${canonicalKey}\`: \`friends\` is not an array — will be reset to []`);
                entry.friends = [];
            }

            // friends must not contain the owner
            if (entry.friends.includes(canonicalKey)) {
                issues.push(`⚠️ Key \`${canonicalKey}\`: owner appears in their own friends list — will be removed`);
                entry.friends = entry.friends.filter(id => id !== canonicalKey);
            }

            // friends must be unique
            const uniqueFriends = [...new Set(entry.friends)];
            if (uniqueFriends.length !== entry.friends.length) {
                issues.push(`⚠️ Key \`${canonicalKey}\`: duplicate friend IDs — will be deduplicated`);
                entry.friends = uniqueFriends;
            }

            // createdAt must be a valid ISO string
            if (isNaN(Date.parse(entry.createdAt))) {
                issues.push(`⚠️ Key \`${canonicalKey}\`: invalid createdAt \`${entry.createdAt}\` — will be set to now`);
                entry.createdAt = new Date().toISOString();
            }

            // Record as clean
            seenChannels.set(entry.channelId, canonicalKey);
            cleaned[canonicalKey] = {
                userId:    entry.userId,
                channelId: entry.channelId,
                createdAt: entry.createdAt,
                friends:   entry.friends,
            };
        }

        // ── 4. Build report ──────────────────────────────────────────────────
        const totalBefore = Object.keys(raw).filter(k => k !== 'channels').length;
        const totalAfter  = Object.keys(cleaned).length;
        const removed     = totalBefore - totalAfter;

        const statusColor = issues.length === 0 ? Colors.Green
                          : dryRun             ? Colors.Yellow
                          :                      Colors.Orange;

        const embed = new EmbedBuilder()
            .setTitle(`Data audit ${dryRun ? '(dry run — no changes written)' : '(--fix applied)'}`)
            .setColor(statusColor)
            .addFields(
                { name: 'Entries before', value: String(totalBefore),   inline: true },
                { name: 'Entries after',  value: String(totalAfter),    inline: true },
                { name: 'Entries removed/fixed', value: String(removed), inline: true },
                { name: 'Issues found',   value: String(issues.length), inline: true },
                { name: 'Backup saved',   value: `\`data/backups/channels-${timestamp}.json\``, inline: false },
            );

        if (!dryRun) {
            embed.addFields({ name: 'Status', value: '✅ channels.json has been rewritten with clean data', inline: false });
        } else {
            embed.addFields({ name: 'To apply fixes', value: 'Run `,fixdata --fix`', inline: false });
        }

        await message.reply({ embeds: [embed] });

        // ── 5. Send issues in chunks (Discord 4096 char limit) ───────────────
        if (issues.length > 0) {
            const CHUNK = 20;
            for (let i = 0; i < issues.length; i += CHUNK) {
                const slice = issues.slice(i, i + CHUNK);
                const issueEmbed = new EmbedBuilder()
                    .setColor(Colors.Yellow)
                    .setTitle(`Issues ${i + 1}–${Math.min(i + CHUNK, issues.length)} of ${issues.length}`)
                    .setDescription(slice.join('\n').substring(0, 4000));
                await message.channel.send({ embeds: [issueEmbed] });
            }
        } else {
            await message.channel.send({ embeds: [
                new EmbedBuilder().setColor(Colors.Green).setDescription('✅ No issues found — data looks clean.')
            ]});
        }

        // ── 6. Write if --fix ────────────────────────────────────────────────
        if (!dryRun) {
            fs.writeFileSync(DATA_PATH, JSON.stringify(cleaned, null, 2), 'utf8');
        }
    },
};