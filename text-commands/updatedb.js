const { EmbedBuilder, Colors, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../data/channels.json');

const PERSONAL_CATEGORY_IDS = [
    '799997847931977749',
    '842471433238347786',
    '1064095644811284490',
];
const ARCHIVE_CATEGORY_ID = '1273361676355244102';

const REQUIRED_ROLES = [
    '768448955804811274',
    '768449168297033769',
    '946729964328337408',
    '1028256286560763984',
    '1028256279124250624',
    '1038106794200932512',
    '1038888209440067604',
    '783032959350734868',
    '1349716423706148894',
];

module.exports = {
    name: 'updatedb',
    description: 'Admin command to sync channel database with reality',
    async execute(message, args) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('You cannot use this command.');
        }

        await message.channel.sendTyping();
        await message.reply('<:infom:1064823078162538497> Starting channel sync, this may take a moment...');

        try {
            let channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

            // Collect all personal channels from Discord (across all 3 categories)
            const allPersonalChannels = message.guild.channels.cache.filter(ch =>
                PERSONAL_CATEGORY_IDS.includes(ch.parentId)
            );

            // Summary trackers
            const summary = {
                updatedFriends: [],      // channels where friends list was updated
                updatedDescription: [],  // channels where topic was written
                ownerLeftServer: [],     // owner not in server (kept in DB)
                ownerMissingRole: [],    // owner in server but missing required role
                notInDatabase: [],       // channel exists on Discord but not in DB, owner found from topic
                noOwnerFound: [],        // channel exists on Discord, not in DB, no topic either
                notInDiscord: [],        // channel in DB but doesn't exist on Discord anymore
            };

            // ── Step 1: Check every channel on Discord in the personal categories ──
            for (const [, channel] of allPersonalChannels) {
                // Skip archived channels
                if (channel.parentId === ARCHIVE_CATEGORY_ID) continue;

                const dbEntry = Object.values(channelsData).find(ch => ch.channelId === channel.id);

                if (!dbEntry) {
                    // Channel exists on Discord but not in database
                    // Try to find owner from channel topic
                    const topic = channel.topic || '';
                    const mentionMatch = topic.match(/<@!?(\d+)>/);

                    if (mentionMatch) {
                        const ownerId = mentionMatch[1];
                        const ownerMember = await message.guild.members.fetch(ownerId).catch(() => null);

                        // Build friends list from permission overwrites
                        const friends = await buildFriendsList(channel, message.guild, ownerId);

                        // Add to database
                        channelsData[ownerId] = {
                            userId: ownerId,
                            channelId: channel.id,
                            createdAt: channel.createdAt.toISOString(),
                            friends,
                        };

                        summary.notInDatabase.push({
                            channel: `<#${channel.id}>`,
                            owner: `<@${ownerId}>`,
                            inServer: !!ownerMember,
                            friendsAdded: friends.length,
                        });
                    } else {
                        // No topic, no way to find owner
                        summary.noOwnerFound.push({
                            channel: `<#${channel.id}>`,
                            channelName: channel.name,
                        });
                    }
                    continue;
                }

                // Channel is in database — now sync it
                const ownerId = dbEntry.userId;

                // Check if topic has owner mention, write it if not
                const topic = channel.topic || '';
                const mentionMatch = topic.match(/<@!?(\d+)>/);
                if (!mentionMatch || mentionMatch[1] !== ownerId) {
                    try {
                        await channel.setTopic(`<@${ownerId}>`);
                        summary.updatedDescription.push({
                            channel: `<#${channel.id}>`,
                            owner: `<@${ownerId}>`,
                        });
                    } catch (e) {
                        console.error(`[SYNC] Failed to set topic for ${channel.id}:`, e);
                    }
                }

                // Check owner status
                const ownerMember = await message.guild.members.fetch(ownerId).catch(() => null);
                if (!ownerMember) {
                    summary.ownerLeftServer.push({
                        channel: `<#${channel.id}>`,
                        owner: `<@${ownerId}>`,
                        channelName: channel.name,
                    });
                    // Keep in DB, don't delete — seec will re-add them when they return
                } else if (!ownerMember.roles.cache.some(r => REQUIRED_ROLES.includes(r.id))) {
                    summary.ownerMissingRole.push({
                        channel: `<#${channel.id}>`,
                        owner: `<@${ownerId}>`,
                        channelName: channel.name,
                    });
                }

                // Sync friends list — reality is who has ViewChannel in Discord
                // We ONLY add missing people to DB, never remove (preserved for return)
                const currentOverwriteIds = channel.permissionOverwrites.cache
                    .filter(ow => ow.type === 1 && ow.allow.has('ViewChannel') && ow.id !== ownerId)
                    .map(ow => ow.id);

                // Fetch each to exclude bots
                const realFriends = [];
                for (const uid of currentOverwriteIds) {
                    const m = await message.guild.members.fetch(uid).catch(() => null);
                    if (m && !m.user.bot) realFriends.push(uid);
                    else if (!m) realFriends.push(uid); // keep even if left server
                }

                // Merge: add any real friends not already in DB
                const existingFriends = dbEntry.friends || [];
                const toAdd = realFriends.filter(id => !existingFriends.includes(id));

                if (toAdd.length > 0) {
                    dbEntry.friends = [...existingFriends, ...toAdd];
                    summary.updatedFriends.push({
                        channel: `<#${channel.id}>`,
                        owner: `<@${ownerId}>`,
                        added: toAdd.map(id => `<@${id}>`).join(', '),
                    });
                }

                channelsData[ownerId] = dbEntry;
            }

            // ── Step 2: Check DB entries whose Discord channel no longer exists ──
            for (const [userId, dbEntry] of Object.entries(channelsData)) {
                if (userId === 'channels') continue;
                if (!dbEntry?.channelId) continue;

                const channel = message.guild.channels.cache.get(dbEntry.channelId);
                if (!channel) {
                    summary.notInDiscord.push({
                        channelId: dbEntry.channelId,
                        owner: `<@${dbEntry.userId || userId}>`,
                    });
                    // Keep in DB — don't delete
                }
            }

            // ── Save updated data ─────────────────────────────────────────────
            fs.writeFileSync(dataPath, JSON.stringify(channelsData, null, 2), 'utf8');

            // ── Send summary embeds ───────────────────────────────────────────
            const anythingToReport =
                summary.updatedFriends.length > 0 ||
                summary.updatedDescription.length > 0 ||
                summary.ownerLeftServer.length > 0 ||
                summary.ownerMissingRole.length > 0 ||
                summary.notInDatabase.length > 0 ||
                summary.noOwnerFound.length > 0 ||
                summary.notInDiscord.length > 0;

            if (!anythingToReport) {
                return message.channel.send('✅ Everything is in sync. No changes needed.');
            }

            if (summary.updatedDescription.length > 0) {
                await sendChunkedEmbed(message, {
                    title: 'Updated Channel Topics',
                    color: Colors.Green,
                    lines: summary.updatedDescription.map(i => `${i.channel} — owner set to ${i.owner}`),
                    footer: `${summary.updatedDescription.length} channels updated`,
                });
            }

            if (summary.updatedFriends.length > 0) {
                await sendChunkedEmbed(message, {
                    title: 'Updated Friends Lists',
                    color: Colors.Green,
                    lines: summary.updatedFriends.map(i => `${i.channel} (${i.owner}) — added: ${i.added}`),
                    footer: `${summary.updatedFriends.length} channels updated`,
                });
            }

            if (summary.notInDatabase.length > 0) {
                await sendChunkedEmbed(message, {
                    title: 'Channels Added to Database',
                    color: Colors.Blue,
                    lines: summary.notInDatabase.map(i =>
                        `${i.channel} — owner ${i.owner}${i.inServer ? '' : ' *(left server)*'}, ${i.friendsAdded} friends added`
                    ),
                    footer: `${summary.notInDatabase.length} channels added`,
                });
            }

            if (summary.ownerLeftServer.length > 0) {
                await sendChunkedEmbed(message, {
                    title: 'Owners Left Server',
                    color: Colors.Red,
                    lines: summary.ownerLeftServer.map(i => `${i.channel} — ${i.owner}`),
                    footer: `${summary.ownerLeftServer.length} channels — data preserved for return`,
                });
            }

            if (summary.ownerMissingRole.length > 0) {
                await sendChunkedEmbed(message, {
                    title: 'Owners Missing Required Role',
                    color: Colors.Yellow,
                    lines: summary.ownerMissingRole.map(i => `${i.channel} — ${i.owner}`),
                    footer: `${summary.ownerMissingRole.length} channels`,
                });
            }

            if (summary.noOwnerFound.length > 0) {
                await sendChunkedEmbed(message, {
                    title: 'Channels — No Owner Found',
                    color: Colors.Grey,
                    lines: summary.noOwnerFound.map(i => `${i.channel} (\`${i.channelName}\`) — not in database, no topic set`),
                    footer: `${summary.noOwnerFound.length} channels — manual review needed`,
                });
            }

            if (summary.notInDiscord.length > 0) {
                await sendChunkedEmbed(message, {
                    title: 'Channels No Longer on Discord',
                    color: Colors.Grey,
                    lines: summary.notInDiscord.map(i => `Channel ID \`${i.channelId}\` — owner ${i.owner}`),
                    footer: `${summary.notInDiscord.length} entries — data preserved`,
                });
            }

            // Final summary
            const summaryEmbed = new EmbedBuilder()
                .setTitle('Sync Complete — Summary')
                .setColor(Colors.Green)
                .addFields(
                    { name: 'Topics Updated', value: String(summary.updatedDescription.length), inline: true },
                    { name: 'Friends Lists Updated', value: String(summary.updatedFriends.length), inline: true },
                    { name: 'Added to Database', value: String(summary.notInDatabase.length), inline: true },
                    { name: 'Owners Left Server', value: String(summary.ownerLeftServer.length), inline: true },
                    { name: 'Missing Role', value: String(summary.ownerMissingRole.length), inline: true },
                    { name: 'No Owner Found', value: String(summary.noOwnerFound.length), inline: true },
                    { name: 'Missing on Discord', value: String(summary.notInDiscord.length), inline: true },
                )
                .setTimestamp()
                .setFooter({ text: `Total channels scanned: ${allPersonalChannels.size}` });

            await message.channel.send({ embeds: [summaryEmbed] });

        } catch (error) {
            console.error('[SYNC] Error:', error);
            await message.channel.send(`<:xmark:934659388386451516> An error occurred during sync: ${error.message}`);
        }
    },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function buildFriendsList(channel, guild, ownerId) {
    const friends = [];
    for (const [, ow] of channel.permissionOverwrites.cache) {
        if (ow.type !== 1) continue;                  // member overwrites only
        if (ow.id === ownerId) continue;              // skip owner
        if (!ow.allow.has('ViewChannel')) continue;   // must have view permission

        const member = await guild.members.fetch(ow.id).catch(() => null);
        if (member && member.user.bot) continue;      // skip bots

        friends.push(ow.id); // keep even if they left server
    }
    return friends;
}

// Sends an embed, splitting into multiple if the description would exceed Discord's 4096 char limit
async function sendChunkedEmbed(message, { title, color, lines, footer }) {
    const chunks = [];
    let current = '';

    for (const line of lines) {
        if ((current + '\n' + line).length > 3900) {
            chunks.push(current);
            current = line;
        } else {
            current = current ? current + '\n' + line : line;
        }
    }
    if (current) chunks.push(current);

    for (let i = 0; i < chunks.length; i++) {
        await message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle(chunks.length > 1 ? `${title} (${i + 1}/${chunks.length})` : title)
                    .setDescription(chunks[i])
                    .setColor(color)
                    .setFooter({ text: i === chunks.length - 1 ? footer : '...' }),
            ]
        });
    }
}