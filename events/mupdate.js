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
        console.log('Attempting to find command user for message:', message.id);
        
        if (message.interaction?.user) {
            console.log('Found user through interaction:', message.interaction.user.id);
            return message.interaction.user.id;
        }

        if (message.reference) {
            const referencedMessage = await message.fetchReference().catch(() => null);
            if (referencedMessage?.interaction?.user) {
                console.log('Found user through reference:', referencedMessage.interaction.user.id);
                return referencedMessage.interaction.user.id;
            }
        }

        const embed = message.embeds[0];
        if (embed?.footer?.text) {
            const userMatch = embed.footer.text.match(/<@!?(\d+)>/);
            if (userMatch) {
                console.log('Found user through embed footer:', userMatch[1]);
                return userMatch[1];
            }
        }

        console.log('Could not find command user through any method');
        return null;
    } catch (error) {
        console.error('Error in findCommandUser:', error);
        return null;
    }
}

async function updateStatusBoard(client) {
    try {
        console.log('Starting status board update...');
        const activityChannel = await client.channels.fetch(ACTIVITY_CHANNEL_ID);
        const guild = activityChannel.guild;

        const members = await guild.members.fetch();
        console.log('Fetched guild members');

        const tier1Users = [];
        const tier2Users = [];

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
                    requirement: userData.missedAmount ? TIER_2_REQUIREMENT + userData.missedAmount : TIER_2_REQUIREMENT,
                    status: userData.status || 'good'
                });
            } else if (hasTier1) {
                tier1Users.push({
                    id: memberId,
                    weeklyDonated: userData.weeklyDonated || 0,
                    requirement: userData.missedAmount ? TIER_1_REQUIREMENT + userData.missedAmount : TIER_1_REQUIREMENT,
                    status: userData.status || 'good'
                });
            }
        }

        const embed = new EmbedBuilder()
            .setTitle('Money Makers Status Board')
            .setColor('#00FF00')
            .setTimestamp();

        if (tier2Users.length > 0) {
            embed.addFields({
                name: 'Tier 2 Members',
                value: tier2Users.map(user => 
                    `<@${user.id}> - ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)} ${user.status === 'warned' ? '⚠️' : ''}`
                ).join('\n') || 'None'
            });
        }

        if (tier1Users.length > 0) {
            embed.addFields({
                name: 'Tier 1 Members',
                value: tier1Users.map(user => 
                    `<@${user.id}> - ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)} ${user.status === 'warned' ? '⚠️' : ''}`
                ).join('\n') || 'None'
            });
        }

        embed.addFields({
            name: 'Total Server Donations',
            value: `⏣ ${formatNumber(statsData.totalDonations || 0)}`,
            inline: false
        });

        const messages = await activityChannel.messages.fetch({ limit: 10 });
        const statusMessage = messages.find(m => 
            m.author.id === client.user.id && 
            m.embeds[0]?.title === 'Money Makers Status Board'
        );

        if (statusMessage) {
            await statusMessage.edit({ embeds: [embed] });
        } else {
            await activityChannel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error('Error updating status board:', error);
        console.error(error.stack);
    }
}

async function weeklyReset(client) {
    try {
        console.log('Starting weekly reset...');
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

        // Remove PRO_MAKER_ROLE from all users and give it to top donor
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
                .setTitle('🏆 Top Donor of the Week')
                .setColor('#FFD700')
                .setDescription(`Congratulations to <@${topDonor}> for being the top donor this week with ⏣ ${formatNumber(topDonation)}!\nThey will keep the <@&${PRO_MAKER_ROLE_ID}> role for the next week.`)
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
                    .setTitle('🎉 Member Promotion')
                    .setColor('#00FF00')
                    .setDescription(`Congratulations to <@${userId}> for being promoted to Tier 2!\nWeekly donation: ⏣ ${formatNumber(userData.weeklyDonated)}`)
                    .setTimestamp();

                await announcementChannel.send({ embeds: [promotionEmbed] });
            }

            // Check for requirement fulfillment or missed requirements
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
                            .setTitle('⚠️ Weekly Requirement Warning')
                            .setColor('#FFD700')
                            .setDescription(`You missed this week's requirement by ⏣ ${formatNumber(missedBy)}.\nYour new requirement for next week will be ⏣ ${formatNumber(requirement + missedBy)}.\nMissing the requirement again will result in demotion.`)
                            .setTimestamp();

                        await member.send({ embeds: [warningEmbed] });
                    } catch (error) {
                        console.error(`Failed to send warning DM to ${userId}:`, error);
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
            .setTitle('Weekly Reset Summary')
            .setColor('#0099ff')
            .setTimestamp();

        if (summary.warnings.length > 0) {
            summaryEmbed.addFields({
                name: '⚠️ Warnings',
                value: summary.warnings.map(w => 
                    `<@${w.userId}> (Tier ${w.tier}) - Missed by ⏣ ${formatNumber(w.missedBy)}\nNew requirement: ⏣ ${formatNumber(w.newRequirement)}`
                ).join('\n\n')
            });
        }

        if (summary.demotions.length > 0) {
            summaryEmbed.addFields({
                name: '⬇️ Demotions',
                value: summary.demotions.map(d => 
                    `<@${d.userId}> (Tier ${d.fromTier} → ${d.toTier}) - Missed by ⏣ ${formatNumber(d.missedBy)}`
                ).join('\n')
            });
        }

        if (summary.promotions.length > 0) {
            summaryEmbed.addFields({
                name: '⬆️ Promotions',
                value: summary.promotions.map(p => 
                    `<@${p.userId}> → Tier ${p.newTier} (Donated: ⏣ ${formatNumber(p.donated)})`
                ).join('\n')
            });
        }

        await adminChannel.send({ embeds: [summaryEmbed] });
        
        saveUsersData();
        await updateStatusBoard(client);
        console.log('Weekly reset completed');
    } catch (error) {
        console.error('Error in weekly reset:', error);
    }
}

module.exports = {
    name: Events.MessageUpdate,
    weeklyReset,  // Exporting for use in index.js
    async execute(client, oldMessage, newMessage) {
        try {
            if (!newMessage.author?.bot) {
                const editedSnipes = client.editedMessages.get(newMessage.channel.id) || [];
                editedSnipes.push({
                    oldContent: oldMessage.content,
                    newContent: newMessage.content,
                    author: newMessage.author.tag,
                    timestamp: Math.floor(Date.now() / 1000)
                });
                client.editedMessages.set(newMessage.channel.id, editedSnipes.slice(-5));
            }

            if (newMessage.channel?.id === TRANSACTION_CHANNEL_ID && 
                newMessage.author?.id === DANK_MEMER_BOT_ID) {
                
                console.log('\n=== Checking message for donation ===');
                
                if (!newMessage.embeds?.length) {
                    console.log('No embeds found in message');
                    return;
                }

                const embed = newMessage.embeds[0];
                if (!embed.description?.includes('Successfully donated')) {
                    console.log('Not a donation message');
                    return;
                }

                const donationMatch = embed.description.match(/Successfully donated \*\*⏣\s*([\d,]+)\*\*/);
                if (!donationMatch) {
                    console.log('Could not extract donation amount');
                    return;
                }

                const donationAmount = parseInt(donationMatch[1].replace(/,/g, ''), 10);
                const donorId = await findCommandUser(newMessage);
                if (!donorId) {
                    console.log('Could not identify donor');
                    return;
                }

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
                        .setTitle('New Donation')
                        .setColor('#00FF00')
                        .setDescription(`<@${donorId}> donated ⏣ ${formatNumber(donationAmount)}`)
                        .addFields({
                            name: 'Weekly Progress',
                            value: `⏣ ${formatNumber(usersData[donorId].weeklyDonated)}/${formatNumber(requirement)}`,
                            inline: true
                        })
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
