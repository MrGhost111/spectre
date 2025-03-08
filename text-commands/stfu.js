const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const NodeCache = require('node-cache');

// Initialize caches
const roleCache = new NodeCache({ stdTTL: 300 }); // 5 minute cache
const memberCache = new NodeCache({ stdTTL: 60 }); // 1 minute cache
// Define paths
const DATA_PATHS = {
    streaks: path.join(__dirname, '../data/streaks.json'),
    mutes: path.join(__dirname, '../data/mutes.json'),
    cooldowns: path.join(__dirname, '../data/cooldowns.json'),
    bars: path.join(__dirname, '../data/bars.json'),
    stats: path.join(__dirname, '../data/stats.json')
};
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
// Helper functions
async function readJsonFile(path, defaultValue = { users: [] }) {
    try {
        const data = await fs.readFile(path, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${path}:`, error);
        await fs.writeFile(path, JSON.stringify(defaultValue), 'utf8');
        return defaultValue;
    }
}
async function writeJsonFile(path, data) {
    try {
        await fs.writeFile(path, JSON.stringify(data, null, 4), 'utf8');
        return true;
    } catch (error) {
        console.error(`Error writing to ${path}:`, error);
        return false;
    }
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

    const totalLuck = Math.min(luck + boosterLuck, 100);
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
async function handleMute(member, duration, muteRole, mutes) {
    try {
        if (!member) {
            console.error('Member not found');
            return false;
        }
        const muteStartTime = Math.floor(Date.now() / 1000);
        const muteEndTime = muteStartTime + duration;

        // Add mute role with retry mechanism
        let muteAttempts = 0;
        const maxAttempts = 3;
        let muteSuccessful = false;

        while (muteAttempts < maxAttempts && !muteSuccessful) {
            try {
                await member.roles.add(muteRole);
                muteSuccessful = true;
            } catch (error) {
                muteAttempts++;
                console.error(`Mute attempt ${muteAttempts} failed:`, error);
                if (muteAttempts === maxAttempts) {
                    console.error(`Failed to mute ${member.user.tag} after ${maxAttempts} attempts:`, error);
                    return false;
                }
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
            }
        }

        if (!muteSuccessful) {
            return false;
        }

        // Create mute data
        const muteData = {
            userId: member.id,
            muteStartTime,
            muteEndTime,
            button_clicked: false,
            guildId: member.guild.id,
            roleId: muteRole.id
        };

        // Add mute data to file
        const existingMuteIndex = mutes.users.findIndex(mute => mute.userId === member.id);
        if (existingMuteIndex !== -1) {
            mutes.users[existingMuteIndex] = muteData;
        } else {
            mutes.users.push(muteData);
        }

        // Write to file immediately to ensure data is saved for risk button
        const writeSuccess = await writeJsonFile(DATA_PATHS.mutes, mutes);

        if (!writeSuccess) {
            console.error(`Failed to write mute data for ${member.user.tag}`);
            // Don't return false here, still try to schedule unmutes even if write fails
        }

        // Function to attempt unmute
        const scheduleUnmute = async () => {
            try {
                const updatedMember = await member.guild.members.fetch(member.id);
                if (updatedMember.roles.cache.has(muteRole.id)) {
                    await updatedMember.roles.remove(muteRole);
                    console.log(`Successfully unmuted ${member.user.tag}`);

                    // After successful unmute, clean up mute data
                    try {
                        const latestMutes = await readJsonFile(DATA_PATHS.mutes);
                        latestMutes.users = latestMutes.users.filter(mute =>
                            !(mute.userId === member.id && mute.muteEndTime === muteEndTime)
                        );
                        await writeJsonFile(DATA_PATHS.mutes, latestMutes);
                    } catch (cleanupError) {
                        console.error('Error cleaning up mute data:', cleanupError);
                    }

                    return true;
                }
                return false;
            } catch (error) {
                console.error(`Failed to unmute ${member.user.tag}:`, error);
                // Retry after 5 seconds if failed
                setTimeout(scheduleUnmute, 5000);
                return false;
            }
        };

        // Schedule multiple unmute attempts at different times
        const unmuteTimes = [
            duration * 1000,           // Exact duration
            (duration * 1000) + 5000,  // 5 seconds after
            (duration * 1000) + 15000  // 15 seconds after
        ];

        unmuteTimes.forEach(time => {
            setTimeout(async () => {
                try {
                    // Check if this mute is still active and not risk-button-clicked
                    const latestMutes = await readJsonFile(DATA_PATHS.mutes);
                    const userMute = latestMutes.users.find(mute =>
                        mute.userId === member.id && mute.muteEndTime === muteEndTime && !mute.button_clicked
                    );

                    if (userMute) {
                        await scheduleUnmute();
                    }
                } catch (error) {
                    console.error('Error in unmute timeout:', error);
                }
            }, time);
        });

        return true;
    } catch (error) {
        console.error('Error in handleMute:', error);
        return false;
    }
}
async function getMemberFromUser(guild, userId) {
    const cacheKey = `member_${guild.id}_${userId}`;
    let member = memberCache.get(cacheKey);

    if (!member) {
        try {
            member = await guild.members.fetch(userId);
            if (member) {
                memberCache.set(cacheKey, member);
            } else {
                return null;
            }
        } catch (error) {
            console.error(`Error fetching member ${userId}:`, error);
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
                    try {
                        const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                        return repliedMessage.author;
                    } catch (error) {
                        console.error('Error fetching replied message:', error);
                    }
                }

                const mentionedUser = message.mentions.users.first();
                if (mentionedUser) return mentionedUser;

                const userArg = message.content.split(' ')[1];
                if (userArg) {
                    try {
                        const member = await getMemberFromUser(message.guild, userArg);
                        if (member) return member.user;
                    } catch (error) {
                        console.error('Error getting member from user ID:', error);
                    }
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
                return message.channel.send("You can't use this command on bots.");
            }

            // Check recent mutes - only consider active mutes (not ones cleared by risk button)
            const mutes = await readJsonFile(DATA_PATHS.mutes);
            const recentMute = mutes.users.find(mute =>
                mute.userId === targetUser.id &&
                (currentTime - mute.muteStartTime) < 120 &&
                !mute.button_clicked
            );

            if (recentMute) {
                return message.channel.send(`${targetUser.username} was muted recently. Stop targeting smh.`);
            }

            // Load bars data
            const barsData = await readJsonFile(DATA_PATHS.bars);
            if (!barsData.bars) {
                return message.channel.send('Error loading bars data. Please try again later.');
            }

            // Calculate luck and roll results
            const totalLuck = calculateLuck(message.member);
            const luckCheckRoll = Math.floor(Math.random() * 101);
            const success = luckCheckRoll <= totalLuck;

            // Handle streaks
            const streaks = await readJsonFile(DATA_PATHS.streaks);
            const userStreak = streaks.users.find(entry => entry.userId === message.author.id);
            const previousStreak = userStreak ? userStreak.streak : 0;
            const currentStreak = success ? (previousStreak + 1) : 0;

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

            // Handle mute role
            const mutedRole = message.guild.roles.cache.get('673978861335085107');
            let muteSuccess = false;

            if (mutedRole) {
                try {
                    const targetMember = await getMemberFromUser(message.guild, muteUser);
                    if (targetMember) {
                        muteSuccess = await handleMute(targetMember, muteDuration, mutedRole, mutes);
                        if (!muteSuccess) {
                            console.error('Failed to apply mute');
                            message.channel.send('There was an issue applying the mute. Please try again or contact an admin.').catch(console.error);
                            return;
                        }
                    } else {
                        console.error('Target member not found');
                        message.channel.send('Could not find the target member. Please try again.').catch(console.error);
                        return;
                    }
                } catch (error) {
                    console.error('Error fetching member or applying mute:', error);
                    message.channel.send('There was an error processing the command. Please try again later.').catch(console.error);
                    return;
                }
            } else {
                console.error('Muted role not found');
                message.channel.send('The muted role could not be found. Please contact an admin.').catch(console.error);
                return;
            }

            // Update streak
            const existingUserIndex = streaks.users.findIndex(entry => entry.userId === message.author.id);
            if (existingUserIndex !== -1) {
                streaks.users[existingUserIndex].streak = currentStreak;
            } else {
                streaks.users.push({ userId: message.author.id, streak: currentStreak });
            }
            await writeJsonFile(DATA_PATHS.streaks, streaks);

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

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setDescription(
                    '## Dope!!\n<:invisible:1277372701710749777>\n' +
                    `**Power:** ${powerRoll}\n<:power:1064835342160625784> ${powerBar}\n` +
                    `**Accuracy:** ${accuracyRoll}\n<:target:1064834827188191292> ${accuracyBar}\n\n` +
                    resultMessage + '\n\n' +
                    `<:YJ_streak:1259258046924853421> Streak: ${streakDisplay}\n` +
                    `<:idk:1064831073881694278> Luck: **${totalLuck}**`
            )
                .setFooter({ text: `Command used by: ${message.author.id}` })
                .setImage('https://media.discordapp.net/attachments/986130247692996628/1259196768822759444/battlefield-2042-ezgif.com-crop.gif?ex=66f64020&is=66f4eea0&hm=6422c352520ce212a6144066b0ded88fa4cd68bc02b15c41beb3d81612616ef1&=&width=750&height=251')
<<<<<<< HEAD
                .setFooter({ text: `Total Uses: ${userStats.totalUses} | Successes: ${userStats.successes} | Fails: ${userStats.fails}` });
=======
                ;
>>>>>>> aed28827d4233c183ae0f9af431589c915e5bee3

            await message.channel.send({ embeds: [embed], components: [actionRow] });

            // Update cooldown
            const cooldownEnd = currentTime + 3600; // 1 hour cooldown
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