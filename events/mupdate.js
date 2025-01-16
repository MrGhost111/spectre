const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');

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

// Load data
let usersData = require(usersFilePath);
const itemsData = require(itemsFilePath);
let lastMessageId = null;

// Utility functions
const saveUsersData = () => {
    fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
};

const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

async function findCommandUser(message) {
    try {
        console.log('Attempting to find command user for message:', message.id);
        
        // Method 1: Check message interaction
        if (message.interaction?.user) {
            console.log('Found user through interaction:', message.interaction.user.id);
            return message.interaction.user.id;
        }

        // Method 2: Check message reference
        if (message.reference) {
            const referencedMessage = await message.fetchReference().catch(() => null);
            if (referencedMessage?.interaction?.user) {
                console.log('Found user through reference:', referencedMessage.interaction.user.id);
                return referencedMessage.interaction.user.id;
            }
        }

        // Method 3: Check embed footer
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

// Add this function in your mupdate.js file, before the module.exports
async function updateStatusBoard(client) {
    try {
        console.log('Starting status board update...');
        const activityChannel = await client.channels.fetch(ACTIVITY_CHANNEL_ID);
        const guild = activityChannel.guild;

        // Get all members with either Tier 1 or Tier 2 roles
        const members = await guild.members.fetch();
        console.log('Fetched guild members');

        const tier1Users = [];
        const tier2Users = [];

        for (const [memberId, member] of members) {
            // Check if member has roles
            const hasTier1 = member.roles.cache.has('783032959350734868');
            const hasTier2 = member.roles.cache.has('1038888209440067604');
            
            const userData = usersData[memberId] || {
                weeklyDonated: 0,
                missedAmount: 0,
                status: 'good'
            };

            if (hasTier2) {
                console.log(`Found Tier 2 user: ${memberId}`);
                tier2Users.push({
                    id: memberId,
                    weeklyDonated: userData.weeklyDonated || 0,
                    requirement: userData.missedAmount ? TIER_2_REQUIREMENT + userData.missedAmount : TIER_2_REQUIREMENT,
                    status: userData.status || 'good'
                });
            } else if (hasTier1) {
                console.log(`Found Tier 1 user: ${memberId}`);
                tier1Users.push({
                    id: memberId,
                    weeklyDonated: userData.weeklyDonated || 0,
                    requirement: userData.missedAmount ? TIER_1_REQUIREMENT + userData.missedAmount : TIER_1_REQUIREMENT,
                    status: userData.status || 'good'
                });
            }
        }

        console.log(`Found ${tier1Users.length} Tier 1 users and ${tier2Users.length} Tier 2 users`);

        // Create embed
        const embed = new EmbedBuilder()
            .setTitle('Money Makers Status Board')
            .setColor('#00FF00')
            .setTimestamp();

        // Add Tier 2 users to embed
        if (tier2Users.length > 0) {
            embed.addFields({
                name: 'Tier 2 Members',
                value: tier2Users.map(user => 
                    `<@${user.id}> - ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)} (${user.status})`
                ).join('\n') || 'None'
            });
        }

        // Add Tier 1 users to embed
        if (tier1Users.length > 0) {
            embed.addFields({
                name: 'Tier 1 Members',
                value: tier1Users.map(user => 
                    `<@${user.id}> - ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)} (${user.status})`
                ).join('\n') || 'None'
            });
        }

        // Find and update existing status message, or send new one
        console.log('Searching for existing status message...');
        const messages = await activityChannel.messages.fetch({ limit: 10 });
        const statusMessage = messages.find(m => 
            m.author.id === client.user.id && 
            m.embeds[0]?.title === 'Money Makers Status Board'
        );

        if (statusMessage) {
            console.log('Updating existing status message');
            await statusMessage.edit({ embeds: [embed] });
        } else {
            console.log('Creating new status message');
            await activityChannel.send({ embeds: [embed] });
        }

        console.log('Status board update complete');
    } catch (error) {
        console.error('Error updating status board:', error);
        console.error(error.stack);
    }
}

module.exports = {
    name: Events.MessageUpdate,
    async execute(client, oldMessage, newMessage) {
        try {
            // Original code for tracking edited messages
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

            // Enhanced donation tracking
            if (newMessage.channel?.id === TRANSACTION_CHANNEL_ID && 
                newMessage.author?.id === DANK_MEMER_BOT_ID) {
                
                console.log('\n=== Checking message for donation ===');
                console.log('Message ID:', newMessage.id);
                
                // Check for embeds
                if (!newMessage.embeds?.length) {
                    console.log('No embeds found in message');
                    return;
                }

                const embed = newMessage.embeds[0];
                console.log('Embed found, checking description');
                console.log('Embed description:', embed.description);

                // Check if it's a donation message
                if (!embed.description?.includes('Successfully donated')) {
                    console.log('Not a donation message');
                    return;
                }

                console.log('Donation message detected!');

                // Extract donation amount
                const donationMatch = embed.description.match(/Successfully donated \*\*⏣\s*([\d,]+)\*\*/);
                if (!donationMatch) {
                    console.log('Could not extract donation amount');
                    return;
                }

                const donationAmount = parseInt(donationMatch[1].replace(/,/g, ''), 10);
                console.log('Donation amount:', formatNumber(donationAmount));

                // Find donor
                const donorId = await findCommandUser(newMessage);
                if (!donorId) {
                    console.log('Could not identify donor');
                    return;
                }

                console.log('Donor ID:', donorId);
                
                // Initialize or update user data
                if (!usersData[donorId]) {
                    console.log('New donor detected, initializing data');
                    usersData[donorId] = {
                        totalDonated: donationAmount,
                        weeklyDonated: donationAmount,
                        currentTier: 1,
                        status: 'good',
                        missedAmount: 0,
                        lastDonation: new Date().toISOString()
                    };
                } else {
                    console.log('Updating existing donor data');
                    console.log('Previous total:', formatNumber(usersData[donorId].totalDonated));
                    console.log('Previous weekly:', formatNumber(usersData[donorId].weeklyDonated));
                    
                    usersData[donorId].totalDonated += donationAmount;
                    usersData[donorId].weeklyDonated += donationAmount;
                    usersData[donorId].lastDonation = new Date().toISOString();

                    console.log('New total:', formatNumber(usersData[donorId].totalDonated));
                    console.log('New weekly:', formatNumber(usersData[donorId].weeklyDonated));
                }

                console.log('Saving user data...');
                saveUsersData();
                console.log('User data saved successfully');

                // Update status board
                console.log('Updating status board...');
                await updateStatusBoard(client);
                console.log('Status board updated');

                // Send donation announcement yes its supposed to go to the transaction channel
                try {
                    console.log('Sending donation announcement...');
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
                    console.log('Donation announcement sent');
                } catch (error) {
                    console.error('Error sending donation announcement:', error);
                }

                console.log('=== Donation processing complete ===\n');
            }

            // Original code for tracking specific message
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
