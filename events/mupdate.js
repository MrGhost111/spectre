// mupdate.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// File paths
const usersFilePath = path.join(__dirname, '../data/users.json');
const weeklyFilePath = path.join(__dirname, '../data/weekly_donations.json');

// Load data files
let usersData = {};
let weeklyData = {};

try {
    usersData = require(usersFilePath);
} catch (error) {
    usersData = {};
    fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
}

try {
    weeklyData = require(weeklyFilePath);
} catch (error) {
    weeklyData = {
        currentWeek: getWeekNumber(new Date()),
        statusMessageId: "1327928823064563806",
        donations: {}
    };
    fs.writeFileSync(weeklyFilePath, JSON.stringify(weeklyData, null, 2));
}

// Constants
const ANNOUNCEMENT_CHANNEL_ID = '833241820959473724';
const TRANSACTION_CHANNEL_ID = '833246120389902356';
const WARNINGS_CHANNEL_ID = '966598961353850910';
const DANK_MEMER_BOT_ID = '270904126974590976';
const TIER_1_ROLE_ID = '783032959350734868';
const TIER_2_ROLE_ID = '1038888209440067604';
const TOP_DONOR_ROLE_ID = '838478632451178506';
const TIER_1_REQUIREMENT = 35000000;
const TIER_2_REQUIREMENT = 70000000;

// Utility functions
function getWeekNumber(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const week = Math.ceil((((d - new Date(year, 0, 1)) / 86400000) + new Date(year, 0, 1).getDay() + 1) / 7);
    return `${year}-W${week.toString().padStart(2, '0')}`;
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function saveData() {
    fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
    fs.writeFileSync(weeklyFilePath, JSON.stringify(weeklyData, null, 2));
}

async function updateStatusMessage(client) {
    try {
        const channel = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
        const message = await channel.messages.fetch(weeklyData.statusMessageId);
        
        let donationText = '';
        for (const [userId, data] of Object.entries(weeklyData.donations)) {
            const total = data.total;
            const user = await client.users.fetch(userId);
            donationText += `<@${userId}>: ⏣ ${formatNumber(total)}\n`;
        }

        const embed = new EmbedBuilder()
            .setTitle('Weekly Donations Status')
            .setDescription(donationText || 'No donations yet this week')
            .addFields(
                { name: 'Tier 1 Requirement', value: `⏣ ${formatNumber(TIER_1_REQUIREMENT)}`, inline: true },
                { name: 'Tier 2 Requirement', value: `⏣ ${formatNumber(TIER_2_REQUIREMENT)}`, inline: true }
            )
            .setTimestamp();

        await message.edit({ embeds: [embed] });
    } catch (error) {
        console.error('Error updating status message:', error);
    }
}

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

        return null;
    } catch (error) {
        console.error('Error finding command user:', error);
        return null;
    }
}

async function handleWeeklyReset(client) {
    try {
        const announcementChannel = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
        const warningsChannel = await client.channels.fetch(WARNINGS_CHANNEL_ID);
        const guild = client.guilds.cache.first();

        // Find top donor
        let topDonorId = null;
        let topDonationAmount = 0;
        for (const [userId, data] of Object.entries(weeklyData.donations)) {
            if (data.total > topDonationAmount) {
                topDonorId = userId;
                topDonationAmount = data.total;
            }
        }

        // Handle top donor role
        if (topDonorId) {
            const currentTopDonor = guild.roles.cache.get(TOP_DONOR_ROLE_ID)?.members.first();
            if (currentTopDonor) {
                await currentTopDonor.roles.remove(TOP_DONOR_ROLE_ID).catch(console.error);
            }
            const newTopDonor = await guild.members.fetch(topDonorId);
            await newTopDonor.roles.add(TOP_DONOR_ROLE_ID).catch(console.error);
        }

        // Process tier requirements and warnings
        const promotions = [];
        const demotions = [];
        const warnings = [];

        for (const [userId, userData] of Object.entries(usersData)) {
            const weeklyTotal = weeklyData.donations[userId]?.total || 0;
            const requirement = userData.currentTier === 2 ? TIER_2_REQUIREMENT : TIER_1_REQUIREMENT;
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) continue;

            if (weeklyTotal < requirement) {
                const missed = requirement - weeklyTotal;
                userData.missedAmount += missed;
                
                // Send warning DM
                try {
                    const warningEmbed = new EmbedBuilder()
                        .setTitle('Weekly Donation Requirement Not Met')
                        .setDescription(`You missed the weekly requirement by ⏣ ${formatNumber(missed)}.\nYour new requirement for next week is ⏣ ${formatNumber(requirement + missed)}.`)
                        .setColor('#FF0000');
                    
                    await member.send({ embeds: [warningEmbed] });
                    warnings.push(`<@${userId}> - Missed by ⏣ ${formatNumber(missed)}`);
                } catch (error) {
                    console.error(`Failed to send warning DM to ${userId}:`, error);
                }

                // Handle demotions
                if (userData.warned) {
                    if (userData.currentTier === 2) {
                        await member.roles.remove(TIER_2_ROLE_ID);
                        await member.roles.add(TIER_1_ROLE_ID);
                        userData.currentTier = 1;
                        demotions.push(`<@${userId}> (Tier 2 → Tier 1)`);
                    } else if (userData.currentTier === 1) {
                        await member.roles.remove(TIER_1_ROLE_ID);
                        userData.currentTier = 0;
                        demotions.push(`<@${userId}> (Tier 1 → None)`);
                    }
                }
                userData.warned = true;
            } else {
                userData.warned = false;
                userData.missedAmount = 0;
            }
        }

        // Send reset announcement
        const resetEmbed = new EmbedBuilder()
            .setTitle('Weekly Donation Reset')
            .setDescription('Here are the results for this week:')
            .addFields(
                { name: 'Top Donor', value: topDonorId ? `<@${topDonorId}> (⏣ ${formatNumber(topDonationAmount)})` : 'No donations this week' },
                { name: 'Promotions', value: promotions.length ? promotions.join('\n') : 'None' },
                { name: 'Demotions', value: demotions.length ? demotions.join('\n') : 'None' }
            )
            .setTimestamp();

        await announcementChannel.send({ embeds: [resetEmbed] });

        // Send warnings summary
        if (warnings.length > 0) {
            const warningsEmbed = new EmbedBuilder()
                .setTitle('Weekly Warning Summary')
                .setDescription(warnings.join('\n'))
                .setColor('#FF0000');
            
            await warningsChannel.send({ embeds: [warningsEmbed] });
        }

        // Reset weekly data
        weeklyData = {
            currentWeek: getWeekNumber(new Date()),
            statusMessageId: weeklyData.statusMessageId,
            donations: {}
        };

        saveData();
        await updateStatusMessage(client);

    } catch (error) {
        console.error('Error in weekly reset:', error);
    }
}

module.exports = {
    name: Events.MessageUpdate,
    async execute(client, oldMessage, newMessage) {
        try {
            if (!newMessage.channel || newMessage.channel.id !== TRANSACTION_CHANNEL_ID ||
                !newMessage.author || newMessage.author.id !== DANK_MEMER_BOT_ID ||
                !newMessage.embeds || newMessage.embeds.length === 0) {
                return;
            }

            const embed = newMessage.embeds[0];
            const description = embed.description || '';
            
            if (!description.includes('Successfully donated')) return;

            const donationMatch = description.match(/Successfully donated \*\*⏣\s*([\d,]+)\*\*/);
            if (!donationMatch) return;

            const donationAmount = parseInt(donationMatch[1].replace(/,/g, ''), 10);
            const donorId = await findCommandUser(newMessage);
            if (!donorId) return;

            // Update weekly donations
            const currentWeek = getWeekNumber(new Date());
            if (currentWeek !== weeklyData.currentWeek) {
                await handleWeeklyReset(client);
            }

            if (!weeklyData.donations[donorId]) {
                weeklyData.donations[donorId] = {
                    total: 0,
                    donations: []
                };
            }

            weeklyData.donations[donorId].total += donationAmount;
            weeklyData.donations[donorId].donations.push({
                amount: donationAmount,
                timestamp: new Date().toISOString()
            });

            // Update overall user data
            if (!usersData[donorId]) {
                usersData[donorId] = {
                    totalDonated: 0,
                    missedAmount: 0,
                    currentTier: 0,
                    warned: false
                };
            }
            usersData[donorId].totalDonated += donationAmount;

            // Handle tier promotions
            const member = await newMessage.guild.members.fetch(donorId);
            const currentWeeklyTotal = weeklyData.donations[donorId].total;
            const availableForPromotion = currentWeeklyTotal - usersData[donorId].missedAmount;

            if (availableForPromotion >= TIER_2_REQUIREMENT && !member.roles.cache.has(TIER_2_ROLE_ID)) {
                await member.roles.remove(TIER_1_ROLE_ID).catch(console.error);
                await member.roles.add(TIER_2_ROLE_ID).catch(console.error);
                usersData[donorId].currentTier = 2;
                usersData[donorId].missedAmount = 0;
            } else if (availableForPromotion >= TIER_1_REQUIREMENT && !member.roles.cache.has(TIER_1_ROLE_ID) && !member.roles.cache.has(TIER_2_ROLE_ID)) {
                await member.roles.add(TIER_1_ROLE_ID).catch(console.error);
                usersData[donorId].currentTier = 1;
                usersData[donorId].missedAmount = 0;
            }

            // Save data and update status
            saveData();
            await updateStatusMessage(client);

            // Send donation announcement
            const announcementChannel = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
            if (announcementChannel) {
                const statsEmbed = new EmbedBuilder()
                    .setTitle('New Donation!')
                    .setColor('#00FF00')
                    .setDescription(`<@${donorId}> donated ⏣ ${formatNumber(donationAmount)}`)
                    .addFields(
                        { name: 'Weekly Total', value: `⏣ ${formatNumber(currentWeeklyTotal)}`, inline: true },
                        { name: 'Required', value: `⏣ ${formatNumber(usersData[donorId].currentTier === 1 ? TIER_2_REQUIREMENT : TIER_1_REQUIREMENT)}`, inline: true },
                        { name: 'Missing from Last Week', value: `⏣ ${formatNumber(usersData[donorId].missedAmount)}`, inline: true }
                    )
                    .setTimestamp();

                await announcementChannel.send({ embeds: [statsEmbed] });
            }
        } catch (error) {
            console.error('Error in messageUpdate event:', error);
        }
    }
};
