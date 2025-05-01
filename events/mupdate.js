const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Constants
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

// File paths
const usersFilePath = path.join(__dirname, '../data/users.json');
const itemsFilePath = path.join(__dirname, '../data/items.json');
const statsFilePath = path.join(__dirname, '../data/stats.json');

// Load data
let usersData = require(usersFilePath);
const itemsData = require(itemsFilePath);
let statsData = fs.existsSync(statsFilePath) ? require(statsFilePath) : { totalDonations: 590000000 };
let lastMessageId = null;

// Utility functions
const saveUsersData = () => {
    fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
};

const saveStatsData = () => {
    fs.writeFileSync(statsFilePath, JSON.stringify(statsData, null, 2));
};

const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

async function findCommandUser(message) {
    try {
        if (message.interaction?.user) {
            return message.interaction.user.id;
        }

        if (message.reference) {
            const referencedMessage = await message.fetchReference().catch(() => null);
            if (referencedMessage?.interaction?.user) {
                return referencedMessage.interaction.user.id;
            }
        }

        const embed = message.embeds[0];
        if (embed?.footer?.text) {
            const userMatch = embed.footer.text.match(/<@!?(\d+)>/);
            if (userMatch) {
                return userMatch[1];
            }
        }

        return null;
    } catch (error) {
        console.error('Error in findCommandUser:', error);
        return null;
    }
}

async function getWeeklyStats(client) {
    const guild = await client.guilds.fetch(client.guilds.cache.first().id);
    const members = await guild.members.fetch();

    const tier1Users = [];
    const tier2Users = [];

    for (const [memberId, member] of members) {
        const hasTier1 = member.roles.cache.has(TIER_1_ROLE_ID);
        const hasTier2 = member.roles.cache.has(TIER_2_ROLE_ID);

        if (hasTier1 || hasTier2) {
            if (!usersData[memberId]) {
                usersData[memberId] = {
                    weeklyDonated: 0,
                    missedAmount: 0,
                    status: 'good',
                    totalDonated: 0,
                    currentTier: hasTier2 ? 2 : 1
                };
            }
        }

        const userData = usersData[memberId] || {
            weeklyDonated: 0,
            missedAmount: 0,
            status: 'good'
        };

        const requirement = hasTier2 ?
            TIER_2_REQUIREMENT :
            TIER_1_REQUIREMENT + (userData.missedAmount || 0);

        if (hasTier2) {
            tier2Users.push({
                id: memberId,
                weeklyDonated: userData.weeklyDonated || 0,
                requirement: requirement
            });
        } else if (hasTier1) {
            tier1Users.push({
                id: memberId,
                weeklyDonated: userData.weeklyDonated || 0,
                requirement: requirement
            });
        }
    }

    tier2Users.sort((a, b) => b.weeklyDonated - a.weeklyDonated);
    tier1Users.sort((a, b) => b.weeklyDonated - a.weeklyDonated);

    return { tier1Users, tier2Users };
}

async function updateStatusBoard(client) {
    try {
        const activityChannel = await client.channels.fetch(ACTIVITY_CHANNEL_ID);
        const { tier1Users, tier2Users } = await getWeeklyStats(client);

        const embed = new EmbedBuilder()
            .setTitle('<:lbtest:1064919048242090054>  Weekly Donations Leaderboard')
            .setColor('#4c00b0')
            .setTimestamp()
            .setFooter({ text: `Total Server Donations: ⏣ ${formatNumber(statsData.totalDonations)}` });

        if (tier2Users.length > 0) {
            embed.addFields({
                name: '<:streak:1064909945373458522>  Tier 2 Members',
                value: tier2Users.map((user, index) =>
                    `\`${index + 1}.\` <@${user.id}> ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)}`
                ).join('\n') || 'None'
            });
        }

        if (tier1Users.length > 0) {
            embed.addFields({
                name: '<:YJ_streak:1259258046924853421>  Tier 1 Members',
                value: tier1Users.map((user, index) =>
                    `\`${index + 1}.\` <@${user.id}> ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)}`
                ).join('\n') || 'None'
            });
        }

        const messages = await activityChannel.messages.fetch({ limit: 10 });
        const statusMessage = messages.find(m =>
            m.author.id === client.user.id &&
            m.embeds[0]?.title?.includes('Weekly Donations Leaderboard')
        );

        if (statusMessage) {
            await statusMessage.edit({ embeds: [embed] });
        } else {
            await activityChannel.send({ embeds: [embed] });
        }

        return { tier1Users, tier2Users };
    } catch (error) {
        console.error('Error updating status board:', error);
        return { tier1Users: [], tier2Users: [] };
    }
}
async function weeklyReset(client) {
    try {
        console.log('[RESET] Starting weekly reset process');

        const guild = await client.guilds.fetch(client.guilds.cache.first().id);
        const announcementChannel = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
        const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID);

        const summary = {
            warnings: [],
            demotions: [],
            promotions: []
        };

        let topDonor = null;
        let topDonation = 0;
        let weeklyDonations = 0;
        const tier2Donations = [];

        const members = await guild.members.fetch();
        for (const [memberId, member] of members) {
            const hasTier1 = member.roles.cache.has(TIER_1_ROLE_ID);
            const hasTier2 = member.roles.cache.has(TIER_2_ROLE_ID);

            if (hasTier1 || hasTier2) {
                if (!usersData[memberId]) {
                    usersData[memberId] = {
                        weeklyDonated: 0,
                        missedAmount: 0,
                        status: 'good',
                        totalDonated: 0,
                        currentTier: hasTier2 ? 2 : 1
                    };
                }
            }

            if (hasTier2 && usersData[memberId]?.weeklyDonated > 0) {
                tier2Donations.push({
                    id: memberId,
                    donated: usersData[memberId].weeklyDonated
                });
            }
        }

        for (const [userId, userData] of Object.entries(usersData)) {
            weeklyDonations += userData.weeklyDonated || 0;
            if (userData.weeklyDonated > topDonation) {
                topDonor = userId;
                topDonation = userData.weeklyDonated;
            }
        }

        const { tier1Users, tier2Users } = await getWeeklyStats(client);
        const weeklyStatsEmbed = new EmbedBuilder()
            .setTitle('<:lbtest:1064919048242090054>  Weekly stats')
            .setColor('#4c00b0')
            .setDescription('Here is how our Money Makers performed this week:');

        if (tier2Users.length > 0) {
            weeklyStatsEmbed.addFields({
                name: '<:streak:1064909945373458522>  Tier 2',
                value: tier2Users.map((user, index) =>
                    `\`${index + 1}.\` <@${user.id}> ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)}`
                ).join('\n') || 'None'
            });
        }

        if (tier1Users.length > 0) {
            weeklyStatsEmbed.addFields({
                name: '<:YJ_streak:1259258046924853421>  Tier 1',
                value: tier1Users.map((user, index) =>
                    `\`${index + 1}.\` <@${user.id}> ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)}`
                ).join('\n') || 'None'
            });
        }

        let pingMessage = `<@&${TIER_1_ROLE_ID}> 
The scoreboard has now been reset! Thank you for all of your donations. We have collected ⏣ ${formatNumber(weeklyDonations)} coins this week`;

        if (statsData.totalDonations && statsData.totalDonations !== weeklyDonations) {
            pingMessage += ` making the total ⏣ ${formatNumber(statsData.totalDonations)}`;
        }

        pingMessage += `. Keep up the great work. 
Congratulations to any promoted members and good luck for the next week. 
You can now send your new requirements in <#${TRANSACTION_CHANNEL_ID}> according to your level!!`;

        await announcementChannel.send(pingMessage);
        await announcementChannel.send({ embeds: [weeklyStatsEmbed] });

        const promotionUserIds = [];

        // ISOLATED SECTION 1: Pro Maker Role Management
        try {
            console.log('[RESET] Removing existing Pro Maker roles');
            const currentProMakerMembers = await guild.members.fetch();
            for (const [memberId, member] of currentProMakerMembers) {
                if (member.roles.cache.has(PRO_MAKER_ROLE_ID)) {
                    await member.roles.remove(PRO_MAKER_ROLE_ID);
                }
            }
        } catch (roleRemovalError) {
            console.error('[RESET] Error removing Pro Maker roles:', roleRemovalError);
            try {
                await announcementChannel.send('<:xmark:934659388386451516> There was an issue updating Pro Money Maker roles. Please notify an admin.');
            } catch (notifyError) {
                console.error('[RESET] Could not send role error notification:', notifyError);
            }
        }

        // ISOLATED SECTION 2: Top Donor Processing
        try {
            console.log('[RESET] Processing top donor');
            if (topDonor) {
                const topDonorMember = await guild.members.fetch(topDonor);
                await topDonorMember.roles.add(PRO_MAKER_ROLE_ID);
                console.log(`[RESET] Added Pro Maker role to ${topDonorMember.user.tag}`);

                const topDonorEmbed = new EmbedBuilder()
                    .setTitle('<:winners:1000018706874781806>  Pro Money Maker of the Week')
                    .setColor('#4c00b0')
                    .setDescription(`> Congratulations to <@${topDonor}> for being the top donor this week with ⏣ ${formatNumber(topDonation)}! They will keep the <@&${PRO_MAKER_ROLE_ID}> role for the next week.`)
                    .setTimestamp();

                await announcementChannel.send({ embeds: [topDonorEmbed] });
                console.log('[RESET] Sent top donor announcement');
            } else {
                console.log('[RESET] No top donor found this week');
            }
        } catch (topDonorError) {
            console.error('[RESET] Error processing top donor:', topDonorError);
            try {
                await announcementChannel.send(`<:xmark:934659388386451516> There was an issue announcing the Pro Money Maker of the week. ${topDonor ? `Congratulations to <@${topDonor}> with ⏣ ${formatNumber(topDonation)}!` : 'No top donor found this week.'}`);
            } catch (notifyError) {
                console.error('[RESET] Could not send top donor error notification:', notifyError);
            }
        }

        for (const [userId, userData] of Object.entries(usersData)) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) continue;

            const isTier2 = member.roles.cache.has(TIER_2_ROLE_ID);
            const isTier1 = member.roles.cache.has(TIER_1_ROLE_ID);

            if (isTier1 && !isTier2 && userData.weeklyDonated >= (TIER_2_REQUIREMENT + (userData.missedAmount || 0))) {
                await member.roles.add(TIER_2_ROLE_ID);
                promotionUserIds.push(userId);
                summary.promotions.push({
                    userId,
                    donated: userData.weeklyDonated,
                    newTier: 2
                });
            }

            if (isTier2) {
                if (userData.weeklyDonated < TIER_2_REQUIREMENT) {
                    await member.roles.remove(TIER_2_ROLE_ID);
                    summary.demotions.push({
                        userId,
                        fromTier: 2,
                        toTier: 1,
                        missedBy: TIER_2_REQUIREMENT - userData.weeklyDonated
                    });
                    userData.status = 'good';
                    userData.missedAmount = 0;
                }
            } else if (isTier1) {
                const requirement = TIER_1_REQUIREMENT + (userData.missedAmount || 0);
                if (userData.weeklyDonated < requirement) {
                    const missedBy = requirement - userData.weeklyDonated;

                    if (userData.status === 'good') {
                        userData.status = 'warned';
                        userData.missedAmount = missedBy;

                        summary.warnings.push({
                            userId,
                            missedBy,
                            tier: 1,
                            newRequirement: TIER_1_REQUIREMENT + missedBy
                        });

                        try {
                            const warningEmbed = new EmbedBuilder()
                                .setTitle('<:xmark:934659388386451516> Weekly Requirement Warning')
                                .setColor('#ff0000')
                                .setDescription(`You missed this week's requirement by ⏣ ${formatNumber(missedBy)}.\nYour new requirement for next week will be ⏣ ${formatNumber(TIER_1_REQUIREMENT + missedBy)}.\n\n<:infom:1064823078162538497> Missing the requirement again will result in demotion.`)
                                .setTimestamp();

                            await member.send({ embeds: [warningEmbed] });
                        } catch (error) {
                            console.error(`Failed to send warning DM to ${userId}`);
                        }
                    } else if (userData.status === 'warned') {
                        await member.roles.remove(TIER_1_ROLE_ID);
                        summary.demotions.push({
                            userId,
                            fromTier: 1,
                            toTier: 0,
                            missedBy
                        });
                        delete usersData[userId];
                    }
                } else {
                    userData.status = 'good';
                    userData.missedAmount = 0;
                }
            }

            userData.weeklyDonated = 0;
        }

        if (promotionUserIds.length > 0) {
            const promotionEmbed = new EmbedBuilder()
                .setTitle('<:power:1064835342160625784>  Promotions')
                .setColor('#4c00b0')
                .setDescription(
                    "These users have fulfilled the requirement to move up a level. They are promoted to tier 2\n\n" +
                    promotionUserIds.map(id => `<:aquadot:860074237954883585> <@${id}>`).join('\n')
                )
                .setTimestamp();
            await announcementChannel.send({ embeds: [promotionEmbed] });
        }

        const tier2DonationsList = tier2Donations
            .filter(donation => donation.donated > 0)
            .map(donation => `/dono add user: <@${donation.id}> amount: ${formatNumber(Math.floor(donation.donated * 1.25))}`)
            .join('\n');

        const summaryEmbed = new EmbedBuilder()
            .setTitle('<:lbtest:1064919048242090054> Weekly Reset Summary')
            .setColor('#4c00b0')
            .setTimestamp();

        summaryEmbed.addFields({
            name: '📊 Weekly Statistics',
            value: `Total Weekly Donations: ⏣ ${formatNumber(weeklyDonations)}\nTotal Server Donations: ⏣ ${formatNumber(statsData.totalDonations)}`
        });

        summaryEmbed.addFields([...weeklyStatsEmbed.data.fields]);

        if (summary.warnings.length > 0) {
            summaryEmbed.addFields({
                name: '<:xmark:934659388386451516> Warnings',
                value: summary.warnings.map(w =>
                    `> <@${w.userId}> (Tier ${w.tier})\n>  Missed by ⏣ ${formatNumber(w.missedBy)}\n> New requirement: ⏣ ${formatNumber(w.newRequirement)}`
                ).join('\n\n')
            });
        }

        if (summary.demotions.length > 0) {
            summaryEmbed.addFields({
                name: '<:xmark:934659388386451516> Demotions',
                value: summary.demotions.map(d =>
                    `> <@${d.userId}> (Tier ${d.fromTier} → ${d.toTier})\n> Missed by ⏣ ${formatNumber(d.missedBy)}`
                ).join('\n\n')
            });
        }

        if (summary.promotions.length > 0) {
            summaryEmbed.addFields({
                name: '<:purpledot:860074414853586984>  Promotions',
                value: summary.promotions.map(p =>
                    `> <@${p.userId}> → Tier ${p.newTier}\n> Donated: ⏣ ${formatNumber(p.donated)}`
                ).join('\n\n')
            });
        }

        if (tier2DonationsList) {
            summaryEmbed.addFields({
                name: '<:purpledot:860074414853586984> Tier 2 Donations List (1.25x)',
                value: tier2DonationsList
            });
        }

        if (summary.warnings.length > 0 || summary.demotions.length > 0 ||
            summary.promotions.length > 0 || tier2DonationsList) {
            await adminChannel.send({ embeds: [summaryEmbed] });
        }

        // ISOLATED SECTION 3: Data Saving
        try {
            console.log('[RESET] Saving stats and user data');
            saveStatsData();
            saveUsersData();
            console.log('[RESET] Data saved successfully');
        } catch (saveError) {
            console.error('[RESET] Error saving data:', saveError);
            try {
                await adminChannel.send('<:xmark:934659388386451516> There was an error saving the data during weekly reset. Please check the logs and verify data integrity.');
            } catch (notifyError) {
                console.error('[RESET] Could not send data save error notification:', notifyError);
            }
        }

        // ISOLATED SECTION 4: Status Board Update
        try {
            console.log('[RESET] Updating status board');
            await updateStatusBoard(client);
            console.log('[RESET] Status board updated successfully');
        } catch (statusError) {
            console.error('[RESET] Error updating status board:', statusError);
            try {
                await adminChannel.send('<:xmark:934659388386451516> There was an error updating the status board during weekly reset.');
            } catch (notifyError) {
                console.error('[RESET] Could not send status board error notification:', notifyError);
            }
        }

        console.log('[RESET] Weekly reset completed successfully');
        return true;
    } catch (error) {
        console.error('[RESET] Critical error in weekly reset:', error);
        try {
            const errorChannel = await client.channels.fetch(ADMIN_CHANNEL_ID);
            await errorChannel.send('<:xmark:934659388386451516> **CRITICAL ERROR DURING WEEKLY RESET**\nThe weekly reset encountered a critical error. Please check the logs and may need to run a manual reset.');
        } catch (notifyError) {
            console.error('[RESET] Could not send critical error notification:', notifyError);
        }
        return false;
    }
}
module.exports = {
    name: Events.MessageUpdate,
    weeklyReset,
    async execute(client, oldMessage, newMessage) {
        try {
            if (oldMessage.content && newMessage.content && oldMessage.content !== newMessage.content) {
                const channelId = newMessage.channel.id;
                const messageData = {
                    author: newMessage.author.tag,
                    oldContent: oldMessage.content,
                    newContent: newMessage.content,
                    timestamp: Math.floor(Date.now() / 1000),
                    messageId: newMessage.id
                };

                if (!client.editedMessages) {
                    client.editedMessages = new Map();
                }

                if (!client.editedMessages.has(channelId)) {
                    client.editedMessages.set(channelId, []);
                }

                const channelMessages = client.editedMessages.get(channelId);
                if (channelMessages.length >= 50) {
                    channelMessages.shift();
                }
                channelMessages.push(messageData);
            }

            if (newMessage.channel?.id === TRANSACTION_CHANNEL_ID &&
                newMessage.author?.id === DANK_MEMER_BOT_ID) {

                if (!newMessage.embeds?.length) return;

                const embed = newMessage.embeds[0];
                if (!embed.description?.includes('Successfully donated')) return;

                const donationMatch = embed.description.match(/Successfully donated \*\*⏣\s*([\d,]+)\*\*/);
                if (!donationMatch) return;

                const donationAmount = parseInt(donationMatch[1].replace(/,/g, ''), 10);
                const donorId = await findCommandUser(newMessage);
                if (!donorId) return;

                const guild = await client.guilds.fetch(client.guilds.cache.first().id);
                const member = await guild.members.fetch(donorId);

                // Immediately update user data and save
                if (!usersData[donorId]) {
                    usersData[donorId] = {
                        totalDonated: donationAmount,
                        weeklyDonated: donationAmount,
                        currentTier: member.roles.cache.has(TIER_2_ROLE_ID) ? 2 :
                            (member.roles.cache.has(TIER_1_ROLE_ID) ? 1 : 0),
                        status: 'good',
                        missedAmount: 0,
                        lastDonation: new Date().toISOString()
                    };
                } else {
                    usersData[donorId].totalDonated = (usersData[donorId].totalDonated || 0) + donationAmount;
                    usersData[donorId].weeklyDonated = (usersData[donorId].weeklyDonated || 0) + donationAmount;
                    usersData[donorId].lastDonation = new Date().toISOString();
                    usersData[donorId].currentTier = member.roles.cache.has(TIER_2_ROLE_ID) ? 2 :
                        (member.roles.cache.has(TIER_1_ROLE_ID) ? 1 : 0);
                }

                // Immediately save data
                statsData.totalDonations += donationAmount;
                saveStatsData();
                saveUsersData();

                // Send donation embed immediately
                const requirement = usersData[donorId].currentTier === 2 ?
                    TIER_2_REQUIREMENT : TIER_1_REQUIREMENT;

                const donationEmbed = new EmbedBuilder()
                    .setTitle('<:prize:1000016483369369650>  New Donation')
                    .setColor('#4c00b0')
                    .setDescription(`<@${donorId}> donated ⏣ ${formatNumber(donationAmount)}\n\n<:purpledot:860074414853586984>  Weekly Progress: ⏣ ${formatNumber(usersData[donorId].weeklyDonated)}/${formatNumber(requirement + (usersData[donorId].missedAmount || 0))}`)
                    .setTimestamp();

                await newMessage.channel.send({ embeds: [donationEmbed] });

                // Update status board in the background
                setImmediate(() => {
                    updateStatusBoard(client).catch(console.error);
                });
            }

            if (newMessage.id === '1315178334325571635') {
                const embed = newMessage.embeds[0];
                if (!embed) return;

                const description = embed.description || embed.data?.description;
                if (!description) return;

                const winningsMatch = description.match(/Winnings:\s\*\*⏣\s([-\d,]+)\*\*/);
                if (!winningsMatch) return;

                const winningsAmount = parseInt(winningsMatch[1].replace(/,/g, ''));
                const count = winningsAmount < 0 ? -1 : +1;

                try {
                    if (!lastMessageId) {
                        const sent = await newMessage.channel.send(`Count: ${count}`);
                        lastMessageId = sent.id;
                    } else {
                        try {
                            const messageToEdit = await newMessage.channel.messages.fetch(lastMessageId);
                            const currentCount = parseInt(messageToEdit.content.split(': ')[1]);
                            await messageToEdit.edit(`Count: ${currentCount + count}`);
                        } catch (err) {
                            const sent = await newMessage.channel.send(`Count: ${count}`);
                            lastMessageId = sent.id;
                        }
                    }
                } catch (error) {
                    console.error('Error handling tracking message:', error);
                }
            }
        } catch (error) {
            console.error('Error in messageUpdate event:', error);
        }
    }
};