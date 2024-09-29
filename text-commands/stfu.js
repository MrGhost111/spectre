const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const streakPath = path.join(__dirname, '../data/streaks.json');
const mutesPath = path.join(__dirname, '../data/mutes.json');

module.exports = {
    name: 'shush',
    description: 'Rolls random power and accuracy numbers and displays their corresponding bars',
    execute(message) {
        // Define base roles required to use the command
        const requiredRoles = [
            '866641313754251297', // 100$
            '1038106794200932512', // 500 tickets
            '866641299355861022', // 50$
            '946729964328337408', // 5bil 
            '866641249452556309', // 25$ 
            '768449168297033769', // 2.5b
            '1028256279124250624', // 300 tickets
            '866641177943080960', // 10$
            '1028256286560763984', // 100 tickets
            '768448955804811274', // 1 bil
            '866641062441254932', // 5$
            '1030707878597763103', // 50 tickets
        ];

        // Check if the user has at least one of the required roles
        const hasRequiredRole = requiredRoles.some(roleId => message.member.roles.cache.has(roleId));

        if (!hasRequiredRole) {
            return message.channel.send('You cannot use this command. Check <#862927749802885150> for more info.');
        }

        const barsPath = path.join(__dirname, '../data/bars.json');

        // Read the bars.json file
        fs.readFile(barsPath, 'utf8', (err, data) => {
            if (err) {
                console.error('Error reading bars.json:', err);
                return message.channel.send('Error loading bars. Please try again later.');
            }

            const bars = JSON.parse(data).bars;

            // Function to get the corresponding bar based on the rolled number
            const getBar = (value, barType) => {
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
            };

            // Calculate luck based on roles
            let luck = 0;

            // Base roles luck calculation
            if (message.member.roles.cache.has('866641313754251297') || 
                message.member.roles.cache.has('1038106794200932512') || 
                message.member.roles.cache.has('866641299355861022') || 
                message.member.roles.cache.has('946729964328337408')) {
                luck = 75;
            } else if (message.member.roles.cache.has('866641249452556309') || 
                       message.member.roles.cache.has('768449168297033769') || 
                       message.member.roles.cache.has('1028256279124250624')) {
                luck = 70;
            } else if (message.member.roles.cache.has('866641177943080960') || 
                       message.member.roles.cache.has('1028256286560763984') || 
                       message.member.roles.cache.has('768448955804811274')) {
                luck = 65;
            } else if (message.member.roles.cache.has('866641062441254932') || 
                       message.member.roles.cache.has('1030707878597763103')) {
                luck = 60;
            }

            // Booster roles luck addition
            let boosterLuck = 0;
            if (message.member.roles.cache.has('721331975847411754')) boosterLuck += 5;
            if (message.member.roles.cache.has('795693315978166292')) boosterLuck += 5;
            if (message.member.roles.cache.has('713452411720827013')) boosterLuck += 5;

            // Total luck is base luck + booster luck
            const totalLuck = Math.min(luck + boosterLuck, 100); // Ensure luck does not exceed 100

            // Streak logic
            let currentStreak = 0;
            let success = false;
            let resultMessage;
            let powerRoll;
            let accuracyRoll;
            let muteUser;

            // Read streaks data from streaks.json
            fs.readFile(streakPath, 'utf8', (err, streakData) => {
                let streaks = { users: [] };
                if (!err) {
                    streaks = JSON.parse(streakData);
                }

                // Find the user's streak entry
                const userStreakEntry = streaks.users.find(entry => entry.userId === message.author.id);
                if (userStreakEntry) {
                    currentStreak = userStreakEntry.streak;
                }

                // Determine target user
                let targetUser;
                if (message.reference) {
                    targetUser = message.reference.messageId
                        ? message.channel.messages.cache.get(message.reference.messageId)?.author
                        : null;
                } else {
                    const mentionedUser = message.mentions.users.first();
                    targetUser = mentionedUser || message.guild.members.cache.find(member => 
                        member.user.username.toLowerCase() === message.content.split(' ')[1]?.toLowerCase() || 
                        member.id === message.content.split(' ')[1]
                    )?.user || null;
                }

                // Proceed if a target user is found
                if (!targetUser) {
                    return message.channel.send('Please specify a valid user to mute.');
                }

                // Determine success or failure based on luck
                const luckCheckRoll = Math.floor(Math.random() * 101); // Roll between 0-100

                let previousStreak = currentStreak; // Save the previous streak value for display
                if (luckCheckRoll <= totalLuck) {
                    // Success
                    success = true;
                    currentStreak += 1;
                    muteUser = targetUser.id;

                    powerRoll = Math.floor(Math.random() * 71) + 30; // Roll power between 30-100
                    accuracyRoll = Math.floor(Math.random() * 51) + 50; // Accuracy between 50-100

                    const muteDuration = Math.floor((powerRoll - 30) * (69 - 35) / (100 - 30) + 35); // Map power to mute duration
                    resultMessage = `> You hit **${targetUser.username}** right into the face and muted them for **${muteDuration} seconds**.`;
                } else {
                    // Failure
                    currentStreak = 0; // Reset streak on failure
                    muteUser = message.author.id;

                    powerRoll = Math.floor(Math.random() * 71) + 30; // Roll power between 30-100
                    accuracyRoll = Math.min(50, Math.floor(Math.random() * 51)); // Accuracy can't be greater than 50
                    
                    const muteDuration = Math.floor((powerRoll - 30) * (69 - 35) / (100 - 30) + 35); // Map power to mute duration
                    resultMessage = `> You missed **${targetUser.username}** and they managed to escape! You muted yourself for **${muteDuration} seconds**.`;
                }

                // Mute logic
                const mutedRole = message.guild.roles.cache.get('673978861335085107');
                if (mutedRole) {
                    const targetMember = message.guild.members.cache.get(muteUser);
                    if (targetMember) {
                        const muteDuration = Math.floor((powerRoll - 30) * (69 - 35) / (100 - 30) + 35);
                        const muteStartTime = Math.floor(Date.now() / 1000);
                        const muteEndTime = muteStartTime + muteDuration;

                        // Add muted role
                        targetMember.roles.add(mutedRole)
                            .then(() => {
                                // Save mute info to mutes.json
                                fs.readFile(mutesPath, 'utf8', (err, mutesData) => {
                                    let mutes = { users: [] };
                                    if (!err) {
                                        mutes = JSON.parse(mutesData);
                                    }

                                    mutes.users.push({
                                        userId: muteUser,
                                        muteStartTime: muteStartTime,
                                        muteEndTime: muteEndTime,
                                        button_clicked: false
                                    });

                                    fs.writeFile(mutesPath, JSON.stringify(mutes, null, 4), (err) => {
                                        if (err) console.error('Error writing mutes data:', err);
                                    });

                                    // Set up unmute function
                                    setTimeout(() => {
                                        fs.readFile(mutesPath, 'utf8', (err, latestMutesData) => {
                                            if (err) {
                                                console.error('Error reading mutes data:', err);
                                                return;
                                            }

                                            let latestMutes = JSON.parse(latestMutesData);
                                            const userMute = latestMutes.users.find(mute => mute.userId === muteUser && mute.muteEndTime === muteEndTime);

                                            if (userMute && !userMute.button_clicked) {
                                                targetMember.roles.remove(mutedRole).catch(console.error);
                                                // Remove the mute entry from mutes.json
                                                latestMutes.users = latestMutes.users.filter(mute => !(mute.userId === muteUser && mute.muteEndTime === muteEndTime));
                                                fs.writeFile(mutesPath, JSON.stringify(latestMutes, null, 4), (err) => {
                                                    if (err) console.error('Error updating mutes data:', err);
                                                });
                                            }
                                        });
                                    }, muteDuration * 1000);
                                });
                            })
                            .catch(console.error);
                    }
                }

                // Update the streak data
                const existingUserIndex = streaks.users.findIndex(entry => entry.userId === message.author.id);
                if (existingUserIndex !== -1) {
                    streaks.users[existingUserIndex].streak = currentStreak;
                } else {
                    streaks.users.push({ userId: message.author.id, streak: currentStreak });
                }

                fs.writeFile(streakPath, JSON.stringify(streaks, null, 4), (err) => {
                    if (err) console.error('Error writing streaks data:', err);
                });

                // Get the bars based on the random rolls
                const powerBar = getBar(powerRoll, 'power');
                const accuracyBar = getBar(accuracyRoll, 'accuracy');

                // Create buttons
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

                // Embed with the updated format and image
                const embed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setDescription(
                        '## Dope!!\n<:invisible:1277372701710749777>\n' +
                        `**Power:** ${powerRoll}\n<:power:1064835342160625784> ${powerBar}\n` +
                        `**Accuracy:** ${accuracyRoll}\n<:target:1064834827188191292> ${accuracyBar}\n\n` +
                        resultMessage + '\n\n' +
                        `<:YJ_streak:1259258046924853421> Streak: **${currentStreak}**\n` +
                        `<:idk:1064831073881694278> Luck: **${totalLuck}**`
                    )
                    .setImage('https://media.discordapp.net/attachments/986130247692996628/1259196768822759444/battlefield-2042-ezgif.com-crop.gif?ex=66f64020&is=66f4eea0&hm=6422c352520ce212a6144066b0ded88fa4cd68bc02b15c41beb3d81612616ef1&=&width=750&height=251');

                // Send the embed message with buttons
                message.channel.send({ embeds: [embed], components: [actionRow] });
            });
        });
    },
};
