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
let statsData = fs.existsSync(statsFilePath) ? require(statsFilePath) : { totalDonations: 0 };
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

async function updateStatusBoard(client) {
    try {
        const activityChannel = await client.channels.fetch(ACTIVITY_CHANNEL_ID);
        const guild = activityChannel.guild;
        const members = await guild.members.fetch();

        const tier1Users = [];
        const tier2Users = [];

        // Collect and sort users based on their donations
        for (const [memberId, member] of members) {
            const hasTier1 = member.roles.cache.has(TIER_1_ROLE_ID);
            const hasTier2 = member.roles.cache.has(TIER_2_ROLE_ID);
            
            const userData = usersData[memberId] || {
                weeklyDonated: 0,
                missedAmount: 0,
                status: 'good'
            };

            if (hasTier2) {
                tier2Users.push({
                    id: memberId,
                    weeklyDonated: userData.weeklyDonated || 0,
                    requirement: userData.missedAmount ? TIER_2_REQUIREMENT + userData.missedAmount : TIER_2_REQUIREMENT
                });
            } else if (hasTier1) {
                tier1Users.push({
                    id: memberId,
                    weeklyDonated: userData.weeklyDonated || 0,
                    requirement: userData.missedAmount ? TIER_1_REQUIREMENT + userData.missedAmount : TIER_1_REQUIREMENT
                });
            }
        }

        // Sort users by weekly donations (highest to lowest)
        tier2Users.sort((a, b) => b.weeklyDonated - a.weeklyDonated);
        tier1Users.sort((a, b) => b.weeklyDonated - a.weeklyDonated);

        const embed = new EmbedBuilder()
            .setTitle('<:lbtest:1064919048242090054>  Money Makers Status Board')
            .setColor('#4c00b0')
            .setTimestamp();

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
                    `\`${index + 1}.\` <:aquadot:860074237954883585> <@${user.id}> ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)}`
                ).join('\n') || 'None'
            });
        }

        embed.addFields({
            name: '<:orangedot:860074358092726312> Total Server Donations',
            value: `⏣ ${formatNumber(statsData.totalDonations || 0)}`,
            inline: false
        });

        const messages = await activityChannel.messages.fetch({ limit: 10 });
        const statusMessage = messages.find(m => 
            m.author.id === client.user.id && 
            m.embeds[0]?.title?.includes('Money Makers Status Board')
        );

        if (statusMessage) {
            await statusMessage.edit({ embeds: [embed] });
        } else {
            await activityChannel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error('Error updating status board:', error);
    }
}

async function weeklyReset(client) {
    try {
        const guild = await client.guilds.fetch(client.guilds.cache.first().id);
        const announcementChannel = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
        const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID);

        // Track weekly summary
        const summary = {
            warnings: [],
            demotions: [],
            promotions: []
        };

        // Find top donor
        let topDonor = null;
        let topDonation = 0;

        for (const [userId, userData] of Object.entries(usersData)) {
            if (userData.weeklyDonated > topDonation) {
                topDonor = userId;
                topDonation = userData.weeklyDonated;
            }
        }

        // Handle PRO_MAKER_ROLE rotation
        const members = await guild.members.fetch();
        for (const [memberId, member] of members) {
            if (member.roles.cache.has(PRO_MAKER_ROLE_ID)) {
                await member.roles.remove(PRO_MAKER_ROLE_ID);
            }
        }

        if (topDonor) {
            const topDonorMember = await guild.members.fetch(topDonor);
            await topDonorMember.roles.add(PRO_MAKER_ROLE_ID);

            const topDonorEmbed = new EmbedBuilder()
                .setTitle('<:winners:1000018706874781806>  Top Donor of the Week')
                .setColor('#4c00b0')
                .setDescription(`> Congratulations to <@${topDonor}> for being the top donor this week with ⏣ ${formatNumber(topDonation)}! They will keep the <@&${PRO_MAKER_ROLE_ID}> role for the next week.`)
                .setTimestamp();

            await announcementChannel.send({ embeds: [topDonorEmbed] });
        }

        // Process each user
        for (const [userId, userData] of Object.entries(usersData)) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) continue;

            const isTier2 = member.roles.cache.has(TIER_2_ROLE_ID);
            const isTier1 = member.roles.cache.has(TIER_1_ROLE_ID);
            const requirement = isTier2 ? TIER_2_REQUIREMENT : TIER_1_REQUIREMENT;

            // Check for promotions
            if (isTier1 && !isTier2 && userData.weeklyDonated >= (TIER_2_REQUIREMENT + (userData.missedAmount || 0))) {
                await member.roles.add(TIER_2_ROLE_ID);
                summary.promotions.push({
                    userId,
                    donated: userData.weeklyDonated,
                    newTier: 2
                });

                const promotionEmbed = new EmbedBuilder()
                    .setTitle('<:power:1064835342160625784>  Member Promotion')
                    .setColor('#4c00b0')
                    .setDescription(` Congratulations to <@${userId}> for being promoted to Tier 2!\n Weekly donation: ⏣ ${formatNumber(userData.weeklyDonated)}`)
                    .setTimestamp();

                await announcementChannel.send({ embeds: [promotionEmbed] });
            }

            // Check requirements
            if (userData.weeklyDonated >= (requirement + (userData.missedAmount || 0))) {
                userData.status = 'good';
                userData.missedAmount = 0;
            } else {
                const missedBy = requirement + (userData.missedAmount || 0) - userData.weeklyDonated;
                
                if (userData.status === 'good') {
                    // First miss
                    userData.status = 'warned';
                    userData.missedAmount = missedBy;
                    
                    summary.warnings.push({
                        userId,
                        missedBy,
                        tier: isTier2 ? 2 : 1,
                        newRequirement: requirement + missedBy
                    });

                    try {
                        const warningEmbed = new EmbedBuilder()
                            .setTitle('<:xmark:934659388386451516> Weekly Requirement Warning')
                            .setColor('#ff0000')
                            .setDescription(`You missed this week's requirement by ⏣ ${formatNumber(missedBy)}.\nYour new requirement for next week will be ⏣ ${formatNumber(requirement + missedBy)}.\n\n<:infom:1064823078162538497> Missing the requirement again will result in demotion.`)
                            .setTimestamp();

                        await member.send({ embeds: [warningEmbed] });
                    } catch (error) {
                        console.error(`Failed to send warning DM to ${userId}`);
                    }
                } else if (userData.status === 'warned') {
                    // Second miss - handle demotion
                    if (isTier2) {
                        await member.roles.remove(TIER_2_ROLE_ID);
                        userData.status = 'good';
                        userData.missedAmount = 0;
                        
                        summary.demotions.push({
                            userId,
                            fromTier: 2,
                            toTier: 1,
                            missedBy
                        });
                    } else if (isTier1) {
                        await member.roles.remove(TIER_1_ROLE_ID);
                        summary.demotions.push({
                            userId,
                            fromTier: 1,
                            toTier: 0,
                            missedBy
                        });
                        delete usersData[userId];
                    }
                }
            }

            // Reset weekly donations
            userData.weeklyDonated = 0;
        }

        // Send weekly summary to admin channel
        const summaryEmbed = new EmbedBuilder()
            .setTitle('<:lbtest:1064919048242090054> Weekly Reset Summary')
            .setColor('#4c00b0')
            .setTimestamp();

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

        await adminChannel.send({ embeds: [summaryEmbed] });
        
        saveUsersData();
        await updateStatusBoard(client);
    } catch (error) {
        console.error('Error in weekly reset:', error);
    }
}

module.exports = {
    name: Events.MessageUpdate,
    weeklyReset,
    async execute(client, oldMessage, newMessage) {
        try {
            // Store edited message data
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
                // Keep only the last 50 edited messages per channel
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

                // Update total server donations
                statsData.totalDonations = (statsData.totalDonations || 0) + donationAmount;
                saveStatsData();
                
                if (!usersData[donorId]) {
                    usersData[donorId] = {
                        totalDonated: donationAmount,
                        weeklyDonated: donationAmount,
                        currentTier: 1,
                        status: 'good',
                        missedAmount: 0,
                        lastDonation: new Date().toISOString()
                    };
                } else {
                    usersData[donorId].totalDonated += donationAmount;
                    usersData[donorId].weeklyDonated += donationAmount;
                    usersData[donorId].lastDonation = new Date().toISOString();
                }

                saveUsersData();
                await updateStatusBoard(client);

                try {
                    const announcementChannel = await client.channels.fetch(TRANSACTION_CHANNEL_ID);
                    const requirement = usersData[donorId].currentTier === 2 ? TIER_2_REQUIREMENT : TIER_1_REQUIREMENT;
                    
                    const donationEmbed = new EmbedBuilder()
                        .setTitle('<:prize:1000016483369369650>  New Donation')
                        .setColor('#4c00b0')
                        .setDescription(`<@${donorId}> donated ⏣ ${formatNumber(donationAmount)}\n\n<:purpledot:860074414853586984>  Weekly Progress: ⏣ ${formatNumber(usersData[donorId].weeklyDonated)}/${formatNumber(requirement)}`)
                        .setTimestamp();

                    await announcementChannel.send({ embeds: [donationEmbed] });
                } catch (error) {
                    console.error('Error sending donation announcement:', error);
                }
            }

            // Message tracking for specific message ID
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
