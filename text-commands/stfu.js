const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

const streakPath = path.join(__dirname, '../data/streaks.json');
const mutesPath = path.join(__dirname, '../data/mutes.json');

module.exports = {
    name: 'stfu',
    description: 'Rolls random power and accuracy numbers and displays their corresponding bars',
    async execute(message) {
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
            '721331975847411754', // server booster
        ];

        // Check if the user has at least one of the required roles
        const hasRequiredRole = requiredRoles.some(roleId => message.member.roles.cache.has(roleId));

        if (!hasRequiredRole) {
            return message.channel.send('You cannot use this command. Check <#862927749802885150> for more info.');
        }

        // Check cooldown
        const currentTime = Math.floor(Date.now() / 1000);
        let mutes = { users: [] };

        try {
            const mutesData = await fs.readFile(mutesPath, 'utf8');
            mutes = JSON.parse(mutesData);
        } catch (error) {
            console.error('Error reading mutes.json:', error);
            // Initialize mutes with an empty structure if file doesn't exist or is malformed
            await fs.writeFile(mutesPath, JSON.stringify({ users: [] }), 'utf8');
        }

        const userMute = mutes.users.find(mute => mute.userId === message.author.id);
        if (userMute && userMute.cooldownEnd > currentTime) {
            const cooldownEndTime = userMute.cooldownEnd;
            return message.channel.send(`You can use it again at <t:${cooldownEndTime}:t> (<t:${cooldownEndTime}:R>)`);
        }

        const barsPath = path.join(__dirname, '../data/bars.json');

        // Read the bars.json file
        let bars;
        try {
            const data = await fs.readFile(barsPath, 'utf8');
            bars = JSON.parse(data).bars;
        } catch (error) {
            console.error('Error reading or parsing bars.json:', error);
            return message.channel.send('Error processing bars data. Please try again later.');
        }

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
                   message.member.roles.cache.has('768448955804811274') || 
                   message.member.roles.cache.has('721331975847411754')) {
            luck = 65;
        } else if (message.member.roles.cache.has('866641062441254932') || 
                   message.member.roles.cache.has('1030707878597763103')) {
            luck = 60;
        }

        // Booster roles luck addition
        let boosterLuck = 0;
        const boosterRoles = ['713452411720827013', '795693315978166292', '721020858818232343'];
        boosterRoles.forEach(roleId => {
            if (message.member.roles.cache.has(roleId)) boosterLuck += 5;
        });

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
        let streaks = { users: [] };
        try {
            const streakData = await fs.readFile(streakPath, 'utf8');
            streaks = JSON.parse(streakData);
        } catch (error) {
            console.error('Error reading or parsing streaks.json:', error);
            // Initialize streaks with an empty structure if file doesn't exist or is malformed
            await fs.writeFile(streakPath, JSON.stringify({ users: [] }), 'utf8');
        }

        // Find the user's streak entry
        const userStreakEntry = streaks.users.find(entry => entry.userId === message.author.id);
        if (userStreakEntry) {
            currentStreak = userStreakEntry.streak;
        }

        // Determine target user
        let targetUser;
        if (message.reference) {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            targetUser = repliedMessage.author;
        } else {
            const mentionedUser = message.mentions.users.first();
            if (mentionedUser) {
                targetUser = mentionedUser;
            } else {
                const userArg = message.content.split(' ')[1];
                if (userArg) {
                    const member = message.guild.members.cache.find(member => 
                        member.user.username.toLowerCase() === userArg.toLowerCase() || 
                        member.id === userArg
                    );
                    if (member) targetUser = member.user;
                }
            }
        }

        // Proceed if a target user is found
        if (!targetUser) {
            return message.channel.send('Please specify a valid user to mute.');
        }

        // Check if the target user was muted in the last 2 minutes (120 seconds)
        const recentMute = mutes.users.find(mute => mute.userId === targetUser.id && (currentTime - mute.muteStartTime) < 120);
        if (recentMute) {
            return message.channel.send(`${targetUser.username} was muted recently. Stop targeting smh.`);
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
            resultMessage = `> You tried to hit  **${targetUser.username}** but failed miserably. Enjoy **${muteDuration} second mute for showing skill issue.**.`;
        }

        // Apply mute
        const mutedRole = message.guild.roles.cache.get('673978861335085107');
        if (mutedRole) {
            const targetMember = await message.guild.members.fetch(muteUser);
            if (targetMember) {
                const muteDuration = Math.floor((powerRoll - 30) * (69 - 35) / (100 - 30) + 35);
                const muteStartTime = Math.floor(Date.now() / 1000);
                const muteEndTime = muteStartTime + muteDuration;

                // Add the muted role to the target user
                await targetMember.roles.add(mutedRole);

                // Update mutes.json
                const existingMuteIndex = mutes.users.findIndex(mute => mute.userId === muteUser);
                if (existingMuteIndex !== -1) {
                    mutes.users[existingMuteIndex] = {
                        userId: muteUser,
                        muteStartTime: muteStartTime,
                        muteEndTime: muteEndTime,
                        button_clicked: false
                    };
                } else {
                    mutes.users.push({
                        userId: muteUser,
                        muteStartTime: muteStartTime,
                        muteEndTime: muteEndTime,
                        button_clicked: false
                    });
                }

                await fs.writeFile(mutesPath, JSON.stringify(mutes, null, 4));

                // Set up the unmute function
                setTimeout(async () => {
                    const latestMutesData = await fs.readFile(mutesPath, 'utf8');
                    const latestMutes = JSON.parse(latestMutesData);
                    const userMute = latestMutes.users.find(mute => mute.userId === muteUser && mute.muteEndTime === muteEndTime);

                    if (userMute && !userMute.button_clicked) {
                        await targetMember.roles.remove(mutedRole);

                        // Remove the mute entry from mutes.json
                        latestMutes.users = latestMutes.users.filter(mute => !(mute.userId === muteUser && mute.muteEndTime === muteEndTime));
                        await fs.writeFile(mutesPath, JSON.stringify(latestMutes, null, 4));
                    }
                }, muteDuration * 1000);
            }
        }

        // Update the streak data
        const existingUserIndex = streaks.users.findIndex(entry => entry.userId === message.author.id);
        if (existingUserIndex !== -1) {
            streaks.users[existingUserIndex].streak = currentStreak;
        } else {
            streaks.users.push({ userId: message.author.id, streak: currentStreak });
        }

        await fs.writeFile(streakPath, JSON.stringify(streaks, null, 4));

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
        await message.channel.send({ embeds: [embed], components: [actionRow] });

      // Update cooldown in mutes.json
        const cooldownEnd = Math.floor(Date.now() / 1000) + 30 * 60; // 30 minutes from now
        const userIndex = mutes.users.findIndex(user => user.userId === message.author.id);
        if (userIndex !== -1) {
            mutes.users[userIndex].cooldownEnd = cooldownEnd;
        } else {
            mutes.users.push({
                userId: message.author.id,
                cooldownEnd: cooldownEnd
            });
        }

        await fs.writeFile(mutesPath, JSON.stringify(mutes, null, 4));
    },
};
