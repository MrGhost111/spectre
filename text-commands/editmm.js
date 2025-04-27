const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// File paths - make sure these match paths used in other scripts
const usersFilePath = path.join(__dirname, '../data/users.json');
const statsFilePath = path.join(__dirname, '../data/stats.json');

// Constants for roles and requirements
const ACTIVITY_CHANNEL_ID = '1327928516662005770';
const STATUS_MESSAGE_ID = '1332155630798241822';
const TIER_1_ROLE_ID = '783032959350734868';
const TIER_2_ROLE_ID = '1038888209440067604';
const TIER_1_REQUIREMENT = 35000000;
const TIER_2_REQUIREMENT = 70000000;

// Format number with commas
const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// Parse shorthand number formats (1k, 1m, 1b, etc.)
const parseAmount = (amountStr) => {
    // Remove commas and convert to lowercase
    amountStr = amountStr.replace(/,/g, '').toLowerCase();

    // Check for scientific notation (1e6, etc.)
    if (amountStr.includes('e')) {
        return Math.floor(Number(amountStr));
    }

    // Check for shorthand notations
    const multipliers = {
        'k': 1000,
        'm': 1000000,
        'b': 1000000000,
        't': 1000000000000
    };

    // Match number followed by letter
    const match = amountStr.match(/^(\d+\.?\d*)([kmbt])$/i);

    if (match) {
        const value = parseFloat(match[1]);
        const multiplier = multipliers[match[2].toLowerCase()];
        return Math.floor(value * multiplier);
    }

    // If no shorthand, try parsing as regular number
    return Math.floor(Number(amountStr));
};

// Function to get weekly stats for tier 1 and tier 2 users
async function getWeeklyStats(client) {
    // Load latest data
    let usersData = {};
    try {
        if (fs.existsSync(usersFilePath)) {
            usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
        }
    } catch (error) {
        console.error('Error reading users data file:', error);
    }

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

// Function to update status board
async function updateStatusBoard(client) {
    try {
        // Load latest data to ensure we're working with current state
        let usersData = {};
        let statsData = { totalDonations: 0 };

        try {
            if (fs.existsSync(usersFilePath)) {
                usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
            }

            if (fs.existsSync(statsFilePath)) {
                statsData = JSON.parse(fs.readFileSync(statsFilePath, 'utf8'));
            }
        } catch (readError) {
            console.error('Error reading data files:', readError);
        }

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

        // Direct approach - fetch the specific message by ID
        try {
            console.log('Attempting to fetch message with ID:', STATUS_MESSAGE_ID);
            const statusMessage = await activityChannel.messages.fetch(STATUS_MESSAGE_ID);
            console.log('Found message, attempting edit');
            await statusMessage.edit({ embeds: [embed] });
            console.log('Status board updated successfully');
        } catch (fetchError) {
            console.error('Could not find or edit the status message:', fetchError);
            console.log('Creating a new status board message');
            const newMessage = await activityChannel.send({ embeds: [embed] });
            console.log('Created new status board message with ID:', newMessage.id);
        }

        return { tier1Users, tier2Users };
    } catch (error) {
        console.error('Error updating status board:', error);
        return { tier1Users: [], tier2Users: [] };
    }
}

module.exports = {
    name: 'editmm',
    description: 'Add or remove donation amount for a Money Maker',
    async execute(message, args) {
        // Updated permission check - specific role ID or user ID
        const targetRoleId = '746298070685188197';
        const targetUserId = '753491023208120321';

        const hasPermission =
            message.member.roles.cache.has(targetRoleId) ||
            message.author.id === targetUserId;

        if (!hasPermission) {
            return message.reply('You do not have permission to use this command.');
        }

        // Command syntax validation
        if (args.length < 3) {
            return message.reply('Usage: `,editmm add/remove @user amount`');
        }

        const action = args[0].toLowerCase();
        if (action !== 'add' && action !== 'remove') {
            return message.reply('Invalid action. Use `add` or `remove`.');
        }

        // Parse user mention
        const userMention = args[1];
        const userId = userMention.replace(/[<@!>]/g, '');
        if (!userId.match(/^\d+$/)) {
            return message.reply('Please mention a valid user.');
        }

        // Parse amount with flexible format support
        const amountStr = args[2];
        const amount = parseAmount(amountStr);

        if (isNaN(amount) || amount <= 0) {
            return message.reply('Please provide a valid positive amount (examples: 1000, 1k, 1.5m, 1b, 1e6).');
        }

        try {
            // Load data files every time to ensure we're working with latest data
            let usersData = {};
            let statsData = { totalDonations: 0 };

            try {
                if (fs.existsSync(usersFilePath)) {
                    usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
                }

                if (fs.existsSync(statsFilePath)) {
                    statsData = JSON.parse(fs.readFileSync(statsFilePath, 'utf8'));
                }
            } catch (readError) {
                console.error('Error reading data files:', readError);
                return message.reply('Error reading data files. Please check the server logs.');
            }

            // Get member info to determine their tier
            const member = await message.guild.members.fetch(userId).catch(() => null);
            if (!member) {
                return message.reply('Unable to find that user in the server.');
            }

            // Find user's current tier based on roles
            const isTier2 = member.roles.cache.has(TIER_2_ROLE_ID);
            const isTier1 = member.roles.cache.has(TIER_1_ROLE_ID);

            if (!isTier1 && !isTier2) {
                return message.reply('This user is not a Money Maker (no tier role found).');
            }

            // Initialize user data if not exists
            if (!usersData[userId]) {
                usersData[userId] = {
                    weeklyDonated: 0,
                    totalDonated: 0,
                    missedAmount: 0,
                    status: 'good',
                    currentTier: isTier2 ? 2 : 1,
                    lastDonation: new Date().toISOString()
                };
            }

            // Update user data
            const oldWeeklyAmount = usersData[userId].weeklyDonated || 0;
            const oldTotalAmount = usersData[userId].totalDonated || 0;

            if (action === 'add') {
                usersData[userId].weeklyDonated = oldWeeklyAmount + amount;
                usersData[userId].totalDonated = oldTotalAmount + amount;
                statsData.totalDonations += amount;
            } else { // remove
                // Ensure we don't go below zero for any value
                usersData[userId].weeklyDonated = Math.max(0, oldWeeklyAmount - amount);
                usersData[userId].totalDonated = Math.max(0, oldTotalAmount - amount);
                statsData.totalDonations = Math.max(0, statsData.totalDonations - amount);
            }

            // Update timestamp of the edit
            usersData[userId].lastEditedAt = new Date().toISOString();

            // Make sure we're saving the current tier from their roles
            usersData[userId].currentTier = isTier2 ? 2 : 1;

            // Save data files
            fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
            fs.writeFileSync(statsFilePath, JSON.stringify(statsData, null, 2));
            console.log(`Successfully ${action}ed ⏣${amount} ${action === 'add' ? 'to' : 'from'} user ${userId}`);

            // Determine requirement based on user's tier and missed amount
            const requirement = isTier2 ?
                TIER_2_REQUIREMENT :
                TIER_1_REQUIREMENT + (usersData[userId].missedAmount || 0);

            // Create and send feedback embed
            const embed = new EmbedBuilder()
                .setTitle(`<:prize:1000016483369369650> Money Maker ${action === 'add' ? 'Addition' : 'Reduction'}`)
                .setColor('#4c00b0')
                .setDescription(
                    `${action === 'add' ? 'Added' : 'Removed'} ⏣ ${formatNumber(amount)} ${action === 'add' ? 'to' : 'from'} <@${userId}>'s donations\n\n` +
                    `<:purpledot:860074414853586984> Weekly Progress: ⏣ ${formatNumber(usersData[userId].weeklyDonated)}/${formatNumber(requirement)}\n` +
                    `<:purpledot:860074414853586984> Total Donated: ⏣ ${formatNumber(usersData[userId].totalDonated)}\n` +
                    `<:purpledot:860074414853586984> Server Total: ⏣ ${formatNumber(statsData.totalDonations)}`
                )
                .setFooter({ text: `Modified by ${message.author.tag}` })
                .setTimestamp();

            await message.reply({ embeds: [embed] });

            // Update the status board
            await updateStatusBoard(message.client);

        } catch (error) {
            console.error('Error in editmm command:', error);
            return message.reply('An error occurred while processing the command. Please check the server logs.');
        }
    },
};