const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const path = require('path');
const NodeCache = require('node-cache');

// Initialize caches
const roleCache = new NodeCache({ stdTTL: 300 }); // 5 minute cache
const memberCache = new NodeCache({ stdTTL: 60 }); // 1 minute cache

// Role configurations
const ROLE_CONFIGS = {
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
    ...ROLE_CONFIGS.tier1.roles,
    ...ROLE_CONFIGS.tier2.roles,
    ...ROLE_CONFIGS.tier3.roles,
    ...ROLE_CONFIGS.tier4.roles
];

// Constants
const MUTED_ROLE_ID = '673978861335085107';
const DATA_PATHS = {
    streaks: path.join(__dirname, '../data/streaks.json'),
    stats: path.join(__dirname, '../data/stats.json'),
    cooldowns: path.join(__dirname, '../data/cooldowns.json'),
    bars: path.join(__dirname, '../data/bars.json')
};

// Helper functions
async function readJsonFile(path, defaultValue = { users: [] }) {
    try {
        const data = await require('fs').promises.readFile(path, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${path}:`, error);
        await require('fs').promises.writeFile(path, JSON.stringify(defaultValue), 'utf8');
        return defaultValue;
    }
}

async function writeJsonFile(path, data) {
    await require('fs').promises.writeFile(path, JSON.stringify(data, null, 4), 'utf8');
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

function calculateLuck(member, streak = 0) {
    const cacheKey = `luck_${member.id}_${streak}`;
    const cachedLuck = roleCache.get(cacheKey);

    if (cachedLuck !== undefined) {
        return cachedLuck;
    }

    let luck = 0;

    // Check tier roles
    for (const tier of Object.values(ROLE_CONFIGS)) {
        if (tier.roles.some(roleId => member.roles.cache.has(roleId))) {
            luck = tier.luck;
            break;
        }
    }

    // Add booster luck
    const boosterLuck = BOOSTER_ROLES.reduce((acc, roleId) =>
        acc + (member.roles.cache.has(roleId) ? 5 : 0), 0);

    // Add streak bonus: 1% for every 10 streak points
    const streakBonus = Math.floor(streak / 10);

    const totalLuck = Math.min(luck + boosterLuck + streakBonus, 100);
    roleCache.set(cacheKey, totalLuck);

    return totalLuck;
}

async function updateUserStats(userId, success) {
    const stats = await readJsonFile(DATA_PATHS.stats);
    const userStats = stats.users.find(user => user.userId === userId) || {
        userId,
        totalUses: 0,
        successes: 0,
        fails: 0
    };

    userStats.totalUses++;
    if (success) {
        userStats.successes++;
    } else {
        userStats.fails++;
    }

    const existingIndex = stats.users.findIndex(user => user.userId === userId);
    if (existingIndex !== -1) {
        stats.users[existingIndex] = userStats;
    } else {
        stats.users.push(userStats);
    }

    await writeJsonFile(DATA_PATHS.stats, stats);
    return userStats;
}

async function getMemberFromUser(guild, userId) {
    const cacheKey = `member_${guild.id}_${userId}`;
    let member = memberCache.get(cacheKey);

    if (!member) {
        try {
            member = await guild.members.fetch(userId);
            memberCache.set(cacheKey, member);
        } catch (error) {
            console.error(`Failed to fetch member ${userId}:`, error);
            return null;
        }
    }

    return member;
}

module.exports = {
    name: 'stfu',
    description: 'Rolls random power and accuracy numbers and displays their corresponding bars',
    async execute(message) {
        try {
            // Check required roles
            if (!REQUIRED_ROLES.some(roleId => message.member.roles.cache.has(roleId))) {
                return message.channel.send('You cannot use this command. Check <#862927749802885150> for more info.');
            }

            // Check cooldown
            const currentTime = Math.floor(Date.now() / 1000);
            const cooldowns = await readJsonFile(DATA_PATHS.cooldowns);
            const userCooldown = cooldowns.users.find(cd => cd.userId === message.author.id);

            if (userCooldown && userCooldown.endTime > currentTime) {
                return message.channel.send(`You can use it again at <t:${userCooldown.endTime}:t> (<t:${userCooldown.endTime}:R>)`);
            }

            // Get target user
            const targetUser = await (async () => {
                if (message.reference) {
                    const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                    return repliedMessage.author;
                }
                const mentionedUser = message.mentions.users.first();
                if (mentionedUser) return mentionedUser;

                const userArg = message.content.split(' ')[1];
                if (userArg) {
                    const member = await getMemberFromUser(message.guild, userArg);
                    if (member) return member.user;
                }
                return null;
            })();

            if (!targetUser) {
                return message.channel.send('Please specify a valid user to mute.');
            }

            if (targetUser.id === message.author.id) {
                return message.channel.send("You can't use this command on yourself.");
            }

            if (targetUser.bot) {
                return message.channel.send("You can't use this command on a bot smh");
            }

            // Check if target was recently muted
            const mutes = await message.client.muteManager.getMutes();
            const recentMute = mutes.users.find(mute =>
                mute.userId === targetUser.id && (currentTime - mute.muteStartTime) < 120
            );

            if (recentMute) {
                return message.channel.send(`${targetUser.username} was muted recently. Stop targeting smh.`);
            }

            // Load bars data
            const barsData = await readJsonFile(DATA_PATHS.bars);
            if (!barsData.bars) {
                return message.channel.send('Error loading bars data. Please try again later.');
            }

            // Get user streak
            const streaks = await readJsonFile(DATA_PATHS.streaks);
            const userStreak = streaks.users.find(entry => entry.userId === message.author.id);
            const previousStreak = userStreak ? userStreak.streak : 0;

            // Calculate luck with streak bonus
            const totalLuck = calculateLuck(message.member, previousStreak);
            const luckCheckRoll = Math.floor(Math.random() * 101);
            const success = luckCheckRoll <= totalLuck;

            // Update streak
            const currentStreak = success ? (previousStreak + 1) : 0;
            const existingUserIndex = streaks.users.findIndex(entry => entry.userId === message.author.id);
            if (existingUserIndex !== -1) {
                streaks.users[existingUserIndex].streak = currentStreak;
            } else {
                streaks.users.push({ userId: message.author.id, streak: currentStreak });
            }
            await writeJsonFile(DATA_PATHS.streaks, streaks);

            // Calculate streak bonus for display
            const streakBonus = Math.floor(previousStreak / 10);

            // Calculate rolls and result message
            const powerRoll = Math.floor(Math.random() * 71) + 30;
            const accuracyRoll = success ?
                Math.floor(Math.random() * 51) + 50 :
                Math.min(50, Math.floor(Math.random() * 51));

            const muteDuration = Math.floor((powerRoll - 30) * (69 - 35) / (100 - 30) + 35);
            const muteUser = success ? targetUser.id : message.author.id;

            const resultMessage = success ?
                `> You hit **${targetUser.username}** right into the face and muted them for **${muteDuration} seconds**.` :
                `> You tried to hit **${targetUser.username}** but failed miserably. Enjoy **${muteDuration} second mute for showing skill issue**.`;

            // Handle mute with the new muteManager - pass the issuer's ID as well
            const muteSuccess = await message.client.muteManager.addMute(
                muteUser,
                message.guild.id,
                MUTED_ROLE_ID,
                muteDuration,
                message.author.id  // Add the issuer's ID
            );

            if (!muteSuccess) {
                console.error('Failed to apply mute');
                return message.channel.send('An error occurred while trying to mute. Please try again later.');
            }

            // Update stats
            const userStats = await updateUserStats(message.author.id, success);

            // Get bars
            const powerBar = getBar(powerRoll, barsData.bars, 'power');
            const accuracyBar = getBar(accuracyRoll, barsData.bars, 'accuracy');

            // Create action row
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('info')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('<:infom:1064823078162538497>'),
                    new ButtonBuilder()
                        .setCustomId('lb')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('<:lbtest:1064919048242090054>'),
                    new ButtonBuilder()
                        .setCustomId('risk')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('<:creepypp:1060554596310843553>')
                );

            // Modify streak display for failed attempts
            const streakDisplay = success
                ? `**${currentStreak}**`
                : `**${previousStreak} → 0**`;

            // Create embed with streak bonus info
            let luckDisplay = `<:idk:1064831073881694278> Luck: **${totalLuck}**`;
            if (streakBonus > 0) {
                luckDisplay = `<:idk:1064831073881694278> Luck: **${totalLuck - streakBonus} + ${streakBonus}**`;
            }

            // Choose image based on success or failure
            const imageUrl = success
                ? 'https://media.discordapp.net/attachments/843413781409169412/1349999094659285022/ezgif-2633322587eafb.gif?ex=67d52421&is=67d3d2a1&hm=cb2fc404c2c45e72634ab768dd0667a517333c72be46c4c2bf0ba9491d138509&=&width=563&height=166'
                : 'https://media.discordapp.net/attachments/1014096605059756032/1350242262256320592/goku.gif?ex=67d60699&is=67d4b519&hm=2a2c950931f683d10b93238a554132fce5d95fc31b39da5663d4c7876e03d912&=&width=798&height=340';

            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setDescription(
                    '## Dope!!\n<:invisible:1277372701710749777>\n' +
                    `**Power:** ${powerRoll}\n<:power:1064835342160625784> ${powerBar}\n` +
                    `**Accuracy:** ${accuracyRoll}\n<:target:1064834827188191292> ${accuracyBar}\n\n` +
                    resultMessage + '\n\n' +
                    `<:YJ_streak:1259258046924853421> Streak: ${streakDisplay}\n` +
                    luckDisplay
                )
                .setImage(imageUrl);

            await message.channel.send({ embeds: [embed], components: [actionRow] });

            // Update cooldown
            const cooldownEnd = currentTime + 3600; // 
            const cooldownIndex = cooldowns.users.findIndex(user => user.userId === message.author.id);
            if (cooldownIndex !== -1) {
                cooldowns.users[cooldownIndex].endTime = cooldownEnd;
            } else {
                cooldowns.users.push({
                    userId: message.author.id,
                    endTime: cooldownEnd
                });
            }
            await writeJsonFile(DATA_PATHS.cooldowns, cooldowns);
        } catch (error) {
            console.error('Error in stfu command:', error);
            message.channel.send('An error occurred while executing the command. Please try again later.');
        }
    },
};