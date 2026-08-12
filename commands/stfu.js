const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');
const path = require('path');
const NodeCache = require('node-cache');

// Initialize cache
const roleCache = new NodeCache({ stdTTL: 300 }); // 5 minute cache

// Role configurations
const ROLE_CONFIGS = {
    special: {
        roles: ['1349716423706148894'],
        luck: 80
    },
    tier1: {
        roles: ['866641313754251297', '1038106794200932512', '866641299355861022', '946729964328337408', '1038888209440067604'],
        luck: 75
    },
    tier2: {
        roles: ['866641249452556309', '768449168297033769', '1028256279124250624', '783032959350734868'],
        luck: 70
    },
    tier3: {
        roles: ['866641177943080960', '1028256286560763984', '768448955804811274', '721331975847411754'],
        luck: 65
    },
    tier4: {
        roles: ['866641062441254932', '1030707878597763103'],
        luck: 60
    }
};

const BOOSTER_ROLES = ['713452411720827013', '721331975847411754', '721020858818232343', '1038888209440067604'];
const REQUIRED_ROLES = [
    ...ROLE_CONFIGS.special.roles,
    ...ROLE_CONFIGS.tier1.roles,
    ...ROLE_CONFIGS.tier2.roles,
    ...ROLE_CONFIGS.tier3.roles,
    ...ROLE_CONFIGS.tier4.roles
];

const MUTED_ROLE_ID = '673978861335085107';
const DATA_PATHS = {
    streaks: path.join(__dirname, '../data/streaks.json'),
    stats: path.join(__dirname, '../data/stats.json'),
    cooldowns: path.join(__dirname, '../data/cooldowns.json'),
    bars: path.join(__dirname, '../data/bars.json')
};

// ── Crit/fumble chances (rolled only on a successful hit) ──────────────────
const HEADSHOT_CHANCE = 0.05;   // 5%
const LUCKY_DODGE_CHANCE = 0.02; // 2%
const HEADSHOT_MULTIPLIER = 2;   // +100% duration

async function readJsonFile(filePath, defaultValue = { users: [] }) {
    try {
        const data = await require('fs').promises.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error);
        await require('fs').promises.writeFile(filePath, JSON.stringify(defaultValue), 'utf8');
        return defaultValue;
    }
}

async function writeJsonFile(filePath, data) {
    await require('fs').promises.writeFile(filePath, JSON.stringify(data, null, 4), 'utf8');
}

function getBar(value, bars, barType) {
    if (value <= 10) return bars[barType]['0-10'];
    if (value <= 20) return bars[barType]['11-20'];
    if (value <= 30) return bars[barType]['21-30'];
    if (value <= 40) return bars[barType]['31-40'];
    if (value <= 50) return bars[barType]['41-50'];
    if (value <= 60) return bars[barType]['51-60'];
    if (value <= 70) return bars[barType]['61-70'];
    if (value <= 80) return bars[barType]['71-80'];
    if (value <= 90) return bars[barType]['81-90'];
    return bars[barType]['91-100'];
}

function calculateLuck(member) {
    const cacheKey = `luck_${member.id}`;
    const cachedLuck = roleCache.get(cacheKey);
    if (cachedLuck !== undefined) return cachedLuck;

    let luck = 0;
    for (const tier of Object.values(ROLE_CONFIGS)) {
        if (tier.roles.some(roleId => member.roles.cache.has(roleId))) {
            luck = tier.luck;
            break;
        }
    }

    const boosterLuck = BOOSTER_ROLES.reduce((acc, roleId) =>
        acc + (member.roles.cache.has(roleId) ? 5 : 0), 0);

    const totalLuck = Math.min(luck + boosterLuck, 100);
    roleCache.set(cacheKey, totalLuck);
    return totalLuck;
}

async function updateUserStats(userId, success) {
    const stats = await readJsonFile(DATA_PATHS.stats);
    const userStats = stats.users.find(u => u.userId === userId) || {
        userId,
        totalUses: 0,
        successes: 0,
        fails: 0
    };

    userStats.totalUses++;
    if (success) userStats.successes++;
    else userStats.fails++;

    const existingIndex = stats.users.findIndex(u => u.userId === userId);
    if (existingIndex !== -1) stats.users[existingIndex] = userStats;
    else stats.users.push(userStats);

    await writeJsonFile(DATA_PATHS.stats, stats);
    return userStats;
}

// Always force-fetch so roles are never stale. NOTE: this intentionally does NOT
// use memberCache. Caching GuildMember objects across calls is unsafe here —
// a cached member can end up detached from a live `guild` reference (e.g. after
// role/cache churn elsewhere), which throws "Cannot read properties of undefined
// (reading 'get')" deep in discord.js's RoleManager when something later reads
// member.roles.cache. That bug only ever shows up on a re-targeted user within
// the old cache's TTL window, which matches the "re-mute the same person" report.
// A guild.members.fetch({ force: true }) call is cheap enough to just always do.
async function fetchMember(guild, userId) {
    try {
        return await guild.members.fetch({ user: userId, force: true });
    } catch (error) {
        console.error(`Failed to fetch member ${userId}:`, error);
        return null;
    }
}

// Finds the most recent speaker in the channel who is NOT the author, NOT the
// target, and NOT a bot. Used for the Lucky Dodge crit. Returns a discord.js
// User, or null if nobody else suitable could be found.
async function findThirdPartySpeaker(channel, authorId, targetId) {
    try {
        const recentMessages = await channel.messages.fetch({ limit: 50 });
        for (const msg of recentMessages.values()) {
            if (msg.author.bot) continue;
            if (msg.author.id === authorId) continue;
            if (msg.author.id === targetId) continue;
            return msg.author;
        }
        return null;
    } catch (error) {
        console.error('Error finding third party speaker for Lucky Dodge:', error);
        return null;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stfu')
        .setDescription('Roll power and accuracy to mute someone (crit/fumble chances included)')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user to use this on')
                .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply();
        try {
            const message_author = interaction.user;
            const message_member = interaction.member;
            const message_guild = interaction.guild;
            const message_channel = interaction.channel;

            // Check required roles
            if (!REQUIRED_ROLES.some(roleId => message_member.roles.cache.has(roleId))) {
                return interaction.editReply('You cannot use this command. Check <#862927749802885150> for more info.');
            }

            const currentTime = Math.floor(Date.now() / 1000);

            // Check cooldown
            const cooldowns = await readJsonFile(DATA_PATHS.cooldowns);
            const userCooldown = cooldowns.users.find(cd => cd.userId === message_author.id);
            if (userCooldown && userCooldown.endTime > currentTime) {
                return interaction.editReply(`You can use it again at <t:${userCooldown.endTime}:t> (<t:${userCooldown.endTime}:R>)`);
            }

            // Get target user (slash option replaces mention/reply/username-text resolution)
            const targetUser = interaction.options.getUser('target');

            if (!targetUser) return interaction.editReply('Please specify a valid user to mute.');
            if (targetUser.id === message_author.id) return interaction.editReply("You can't use this command on yourself.");
            if (targetUser.bot) return interaction.editReply("You can't use this command on a bot smh");

            // Force-fetch target member so roles are always current
            const targetMember = await fetchMember(message_guild, targetUser.id);
            if (!targetMember) return interaction.editReply('Could not find the target user in this server.');

            // ── Immunity checks ──────────────────────────────────────────────
            const mutes = await interaction.client.muteManager.getMutes();
            const targetMuteEntry = mutes.users.find(mute => mute.userId === targetUser.id);

            // Re-check roles from force-fetched member
            const isCurrentlyMuted = targetMember.roles.cache.has(MUTED_ROLE_ID) ||
                (targetMuteEntry && targetMuteEntry.muteEndTime > currentTime);

            if (isCurrentlyMuted) {
                const unmuteTime = targetMuteEntry ? targetMuteEntry.muteEndTime : null;
                const timeMsg = unmuteTime ? ` They'll be free <t:${unmuteTime}:R>.` : '';
                return interaction.editReply(`${targetUser.username} is already muted, stop targeting smh.${timeMsg}`);
            }

            // Post-mute 2-minute immunity window (excludes self-inflicted mutes)
            const recentMute = mutes.users.find(mute =>
                mute.userId === targetUser.id &&
                mute.issuerId !== targetUser.id &&
                (currentTime - mute.muteStartTime) < 120
            );
            if (recentMute) {
                const unlocksAt = recentMute.muteStartTime + 120;
                return interaction.editReply(`${targetUser.username} was muted recently. Stop targeting smh. You can go again <t:${unlocksAt}:R>.`);
            }
            // ─────────────────────────────────────────────────────────────────

            // Load bars data
            const barsData = await readJsonFile(DATA_PATHS.bars);
            if (!barsData.bars) return interaction.editReply('Error loading bars data. Please try again later.');

            // Get user streak
            const streaks = await readJsonFile(DATA_PATHS.streaks);
            const userStreak = streaks.users.find(entry => entry.userId === message_author.id);
            const previousStreak = userStreak ? userStreak.streak : 0;

            // Calculate luck and roll
            const totalLuck = calculateLuck(message_member);
            const luckCheckRoll = Math.floor(Math.random() * 101);
            const success = luckCheckRoll <= totalLuck;

            // ── Crit / fumble rolls (success-only, as designed) ─────────────
            let isHeadshot = false;
            let isLuckyDodge = false;
            let dodgeTarget = null; // resolved third-party user, if dodge triggers and one is found

            if (success) {
                // Roll independently so both could theoretically happen at once;
                // dodge takes priority for who gets muted, headshot still boosts duration.
                isHeadshot = Math.random() < HEADSHOT_CHANCE;
                isLuckyDodge = Math.random() < LUCKY_DODGE_CHANCE;

                if (isLuckyDodge) {
                    dodgeTarget = await findThirdPartySpeaker(message_channel, message_author.id, targetUser.id);
                    // Per design: if nobody else suitable is found, fall back to
                    // muting the original target as if no dodge happened.
                    if (!dodgeTarget) {
                        isLuckyDodge = false;
                    }
                }
            }

            // Update streak
            const currentStreak = success ? (previousStreak + 1) : 0;
            const existingUserIndex = streaks.users.findIndex(entry => entry.userId === message_author.id);
            if (existingUserIndex !== -1) streaks.users[existingUserIndex].streak = currentStreak;
            else streaks.users.push({ userId: message_author.id, streak: currentStreak });
            await writeJsonFile(DATA_PATHS.streaks, streaks);

            // Calculate rolls
            const powerRoll = Math.floor(Math.random() * 71) + 30;
            const accuracyRoll = success
                ? Math.floor(Math.random() * 51) + 50
                : Math.min(50, Math.floor(Math.random() * 51));

            let muteDuration = Math.floor((powerRoll - 30) * (69 - 35) / (100 - 30) + 35);
            if (isHeadshot) muteDuration = Math.floor(muteDuration * HEADSHOT_MULTIPLIER);

            // Who actually gets muted:
            // - success + dodge      -> the resolved third party
            // - success (no dodge)   -> target
            // - fail                 -> author (self-inflicted)
            const muteUserId = success
                ? (isLuckyDodge ? dodgeTarget.id : targetUser.id)
                : message_author.id;

            // ── Result text ─────────────────────────────────────────────────
            let resultMessage;
            let accentColor = 0xFFA500; // default orange, matches original embed color

            if (isLuckyDodge) {
                resultMessage =
                    `> **${targetUser.username}** saw it coming and dodged at the last second! ` +
                    `The hit flew wild and clocked **${dodgeTarget.username}** instead — muted for **${muteDuration} seconds**. ` +
                    `Wrong place, wrong time.`;
                accentColor = 0x9B59B6; // purple, to visually flag the rare dodge outcome
            } else if (success && isHeadshot) {
                resultMessage =
                    `> 🎯 **HEADSHOT!** You hit **${targetUser.username}** clean in the face and muted them for **${muteDuration} seconds** ` +
                    `(critical hit, duration doubled).`;
                accentColor = 0xE74C3C; // red, to flag the crit
            } else if (success) {
                resultMessage = `> You hit **${targetUser.username}** right into the face and muted them for **${muteDuration} seconds**.`;
            } else {
                resultMessage = `> You tried to hit **${targetUser.username}** but failed miserably. Enjoy **${muteDuration} second mute for showing skill issue**.`;
            }

            const muteSuccess = await interaction.client.muteManager.addMute(
                muteUserId,
                message_guild.id,
                MUTED_ROLE_ID,
                muteDuration,
                message_author.id  // issuerId is always the command author
            );

            if (!muteSuccess) {
                console.error('Failed to apply mute');
                return interaction.editReply('An error occurred while trying to mute. Please try again later.');
            }

            await updateUserStats(message_author.id, success);

            const powerBar = getBar(powerRoll, barsData.bars, 'power');
            const accuracyBar = getBar(accuracyRoll, barsData.bars, 'accuracy');

            const streakDisplay = success ? `**${currentStreak}**` : `**${previousStreak} → 0**`;
            const luckDisplay = `<:idk:1064831073881694278> Luck: **${totalLuck}**`;

            const imageUrl = success
                ? 'https://media.discordapp.net/attachments/843413781409169412/1349999094659285022/ezgif-2633322587eafb.gif?ex=67d52421&is=67d3d2a1&hm=cb2fc404c2c45e72634ab768dd0667a517333c72be46c4c2bf0ba9491d138509&=&width=563&height=166'
                : 'https://media.discordapp.net/attachments/1014096605059756032/1350242262256320592/goku.gif?ex=67d60699&is=67d4b519&hm=2a2c950931f683d10b93238a554132fce5d95fc31b39da5663d4c7876e03d912&=&width=798&height=340';

            let headerLine = '## Dope!!';
            if (isLuckyDodge) headerLine = '## 🍀 Lucky Dodge!!';
            else if (success && isHeadshot) headerLine = '## 🎯 Headshot!!';

            const bodyText =
                `${headerLine}\n<:invisible:1277372701710749777>\n` +
                `**Power:** ${powerRoll}\n<:power:1064835342160625784> ${powerBar}\n` +
                `**Accuracy:** ${accuracyRoll}\n<:target:1064834827188191292> ${accuracyBar}\n\n` +
                resultMessage + '\n\n' +
                `<:YJ_streak:1259258046924853421> Streak: ${streakDisplay}\n` +
                luckDisplay;

            // ── Build the message as a single Components V2 container ──────
            // This replaces the old EmbedBuilder + separate ActionRow entirely.
            // The container itself IS the "embed" (colored bar on the left via
            // setAccentColor), and the buttons live inside it, below the image,
            // instead of being a trailing action row outside the embed.
            const container = new ContainerBuilder()
                .setAccentColor(accentColor)
                .addTextDisplayComponents(
                    textDisplay => textDisplay.setContent(bodyText)
                )
                .addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(
                        new MediaGalleryItemBuilder().setURL(imageUrl)
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder()
                        .setDivider(true)
                        .setSpacing(SeparatorSpacingSize.Small)
                )
                .addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('info')
                            .setStyle(ButtonStyle.Secondary)
                            .setLabel('Info')
                            .setEmoji('<:infom:1064823078162538497>'),
                        new ButtonBuilder()
                            .setCustomId('lb')
                            .setStyle(ButtonStyle.Secondary)
                            .setLabel('Leaderboard')
                            .setEmoji('<:lbtest:1064919048242090054>'),
                        new ButtonBuilder()
                            .setCustomId('risk')
                            .setStyle(ButtonStyle.Danger)
                            .setLabel('Risk')
                            .setEmoji('<:creepypp:1507477093108285451>')
                    )
                );

            await interaction.editReply({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
            });

            // Update cooldown
            const cooldownEnd = currentTime + 3600;
            const cooldownIndex = cooldowns.users.findIndex(u => u.userId === message_author.id);
            if (cooldownIndex !== -1) cooldowns.users[cooldownIndex].endTime = cooldownEnd;
            else cooldowns.users.push({ userId: message_author.id, endTime: cooldownEnd });
            await writeJsonFile(DATA_PATHS.cooldowns, cooldowns);

        } catch (error) {
            console.error('Error in stfu command:', error);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply('An error occurred while executing the command. Please try again later.');
            } else {
                await interaction.reply('An error occurred while executing the command. Please try again later.');
            }
        }
    },
};
