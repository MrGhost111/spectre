const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// File paths - make sure these match paths used in other scripts
const usersFilePath = path.join(__dirname, '../data/users.json');
const statsFilePath = path.join(__dirname, '../data/stats.json');

// Format number with commas
const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

module.exports = {
    name: 'editmm',
    description: 'Add or remove donation amount for a Money Maker',
    async execute(message, args) {
        // Permission check - adjust roles as needed for your setup
        const adminRoleIds = ['713452411720827013', '765988972596822036', '946729964328337408'];
        const hasPermission = message.member.roles.cache.some(role => adminRoleIds.includes(role.id));

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

        // Parse amount
        const amount = parseInt(args[2].replace(/,/g, ''));
        if (isNaN(amount) || amount <= 0) {
            return message.reply('Please provide a valid positive amount.');
        }

        try {
            // Load data
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
            const TIER_1_ROLE_ID = '783032959350734868';
            const TIER_2_ROLE_ID = '1038888209440067604';

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

            // Save data
            fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
            fs.writeFileSync(statsFilePath, JSON.stringify(statsData, null, 2));

            // Determine requirement based on user's tier and missed amount
            const TIER_1_REQUIREMENT = 35000000;
            const TIER_2_REQUIREMENT = 70000000;

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

            // Update the status board in the background
            try {
                // Use the existing updateStatusBoard function from your event handler if accessible
                if (message.client.updateStatusBoard) {
                    setImmediate(() => {
                        message.client.updateStatusBoard(message.client).catch(console.error);
                    });
                } else {
                    console.log('Note: Status board update function not available. Will need manual update.');
                }
            } catch (statusError) {
                console.error('Error updating status board:', statusError);
            }

        } catch (error) {
            console.error('Error in editmm command:', error);
            return message.reply('An error occurred while processing the command. Please check the server logs.');
        }
    },
};