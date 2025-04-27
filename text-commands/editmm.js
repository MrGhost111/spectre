const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Constants
const usersFilePath = path.join(__dirname, '../data/users.json');
const statsFilePath = path.join(__dirname, '../data/stats.json');
const auditLogPath = path.join(__dirname, '../data/audit.json');
const ACTIVITY_CHANNEL_ID = '1327928516662005770';
const ADMIN_CHANNEL_ID = '966598961353850910';
const TIER_1_ROLE_ID = '783032959350734868';
const TIER_2_ROLE_ID = '1038888209440067604';

// Permission settings
const ALLOWED_ROLE_ID = '746298070685188197';
const ALLOWED_USER_ID = '753491023208120321';

// Format number with commas
const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// Parse shorthand number formats (1k, 1m, 1b, etc.)
const parseAmount = (amountStr) => {
    amountStr = amountStr.replace(/,/g, '').toLowerCase();

    if (amountStr.includes('e')) {
        return Math.floor(Number(amountStr));
    }

    const multipliers = {
        'k': 1000,
        'm': 1000000,
        'b': 1000000000,
        't': 1000000000000
    };

    const match = amountStr.match(/^(\d+\.?\d*)([kmbt])$/i);

    if (match) {
        const value = parseFloat(match[1]);
        const multiplier = multipliers[match[2].toLowerCase()];
        return Math.floor(value * multiplier);
    }

    return Math.floor(Number(amountStr));
};

async function updateStatusBoard(client) {
    try {
        const activityChannel = await client.channels.fetch(ACTIVITY_CHANNEL_ID);
        const guild = await client.guilds.fetch(client.guilds.cache.first().id);
        const members = await guild.members.fetch();

        const tier1Users = [];
        const tier2Users = [];

        for (const [memberId, member] of members) {
            const hasTier1 = member.roles.cache.has(TIER_1_ROLE_ID);
            const hasTier2 = member.roles.cache.has(TIER_2_ROLE_ID);

            if (hasTier1 || hasTier2) {
                const userData = usersData[memberId] || {
                    weeklyDonated: 0,
                    missedAmount: 0,
                    status: 'good',
                    totalDonated: 0,
                    currentTier: hasTier2 ? 2 : 1
                };

                const requirement = hasTier2 ?
                    TIER_2_REQUIREMENT :
                    TIER_1_REQUIREMENT + (userData.missedAmount || 0);

                if (hasTier2) {
                    tier2Users.push({
                        id: memberId,
                        weeklyDonated: userData.weeklyDonated,
                        requirement: requirement
                    });
                } else {
                    tier1Users.push({
                        id: memberId,
                        weeklyDonated: userData.weeklyDonated,
                        requirement: requirement
                    });
                }
            }
        }

        tier2Users.sort((a, b) => b.weeklyDonated - a.weeklyDonated);
        tier1Users.sort((a, b) => b.weeklyDonated - a.weeklyDonated);

        const embed = new EmbedBuilder()
            .setTitle('<:lbtest:1064919048242090054> Weekly Donations Leaderboard')
            .setColor('#4c00b0')
            .setTimestamp()
            .setFooter({ text: `Total Server Donations: ⏣ ${formatNumber(statsData.totalDonations)}` });

        if (tier2Users.length > 0) {
            embed.addFields({
                name: '<:streak:1064909945373458522> Tier 2 Members',
                value: tier2Users.map((user, index) =>
                    `\`${index + 1}.\` <@${user.id}> ⏣ ${formatNumber(user.weeklyDonated)}/${formatNumber(user.requirement)}`
                ).join('\n') || 'None'
            });
        }

        if (tier1Users.length > 0) {
            embed.addFields({
                name: '<:YJ_streak:1259258046924853421> Tier 1 Members',
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

        return true;
    } catch (error) {
        console.error('Error updating status board:', error);
        return false;
    }
}

module.exports = {
    name: 'editmm',
    description: 'Add or remove donation amount for a Money Maker',
    async execute(message, args) {
        // Permission check
        const hasPermission =
            message.member.roles.cache.has(ALLOWED_ROLE_ID) ||
            message.author.id === ALLOWED_USER_ID;

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
        const amountStr = args[2];
        const amount = parseAmount(amountStr);

        if (isNaN(amount) || amount <= 0) {
            return message.reply('Please provide a valid positive amount (examples: 1000, 1k, 1.5m, 1b, 1e6).');
        }

        try {
            // Load data
            let usersData = {};
            let statsData = { totalDonations: 0 };

            if (fs.existsSync(usersFilePath)) {
                usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
            }

            if (fs.existsSync(statsFilePath)) {
                statsData = JSON.parse(fs.readFileSync(statsFilePath, 'utf8'));
            }

            // Get member info
            const member = await message.guild.members.fetch(userId).catch(() => null);
            if (!member) {
                return message.reply('Unable to find that user in the server.');
            }

            // Check if user has Money Maker role
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

            // Create audit log before changes
            const auditLog = {
                timestamp: new Date().toISOString(),
                adminId: message.author.id,
                userId,
                action,
                amount,
                before: {
                    weekly: usersData[userId].weeklyDonated,
                    total: usersData[userId].totalDonated,
                    serverTotal: statsData.totalDonations
                }
            };

            // Update user data
            const oldWeeklyAmount = usersData[userId].weeklyDonated;
            const oldTotalAmount = usersData[userId].totalDonated;

            if (action === 'add') {
                usersData[userId].weeklyDonated += amount;
                usersData[userId].totalDonated += amount;
                statsData.totalDonations += amount;
            } else {
                usersData[userId].weeklyDonated = Math.max(0, oldWeeklyAmount - amount);
                usersData[userId].totalDonated = Math.max(0, oldTotalAmount - amount);
                statsData.totalDonations = Math.max(0, statsData.totalDonations - amount);
            }

            // Update last edited timestamp
            usersData[userId].lastEditedAt = new Date().toISOString();

            // Save audit log after changes
            auditLog.after = {
                weekly: usersData[userId].weeklyDonated,
                total: usersData[userId].totalDonated,
                serverTotal: statsData.totalDonations
            };

            let auditLogs = [];
            if (fs.existsSync(auditLogPath)) {
                auditLogs = JSON.parse(fs.readFileSync(auditLogPath, 'utf8'));
            }
            auditLogs.push(auditLog);
            fs.writeFileSync(auditLogPath, JSON.stringify(auditLogs, null, 2));

            // Save data files
            fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
            fs.writeFileSync(statsFilePath, JSON.stringify(statsData, null, 2));

            // Determine requirement for display
            const requirement = isTier2 ?
                TIER_2_REQUIREMENT :
                TIER_1_REQUIREMENT + (usersData[userId].missedAmount || 0);

            // Create response embed
            const embed = new EmbedBuilder()
                .setTitle(`<:prize:1000016483369369650> Money Maker ${action === 'add' ? 'Addition' : 'Reduction'}`)
                .setColor('#4c00b0')
                .setDescription(
                    `${action === 'add' ? 'Added' : 'Removed'} ⏣ ${formatNumber(amount)} ${action === 'add' ? 'to' : 'from'} <@${userId}>'s donations\n\n` +
                    `<:purpledot:860074414853586984> Weekly Progress: ⏣ ${formatNumber(usersData[userId].weeklyDonated)}/${formatNumber(requirement)}\n` +
                    `<:purpledot:860074414853586984> Total Donated: ⏣ ${formatNumber(usersData[userId].totalDonated)}\n` +
                    `<:purpledot:860074414853586984> Server Total: ⏣ ${formatNumber(statsData.totalDonations)}`
                )
                .setFooter({
                    text: `Modified by ${message.author.tag}`,
                    iconURL: message.author.displayAvatarURL()
                })
                .setTimestamp();

            const reply = await message.reply({ embeds: [embed] });

            // Update status board
            try {
                const success = await updateStatusBoard(message.client);
                if (success) {
                    await reply.edit({
                        embeds: [embed.setFooter({
                            text: `${message.author.tag} | Status board updated successfully`,
                            iconURL: message.author.displayAvatarURL()
                        })]
                    });
                } else {
                    await reply.edit({
                        embeds: [embed.setFooter({
                            text: `${message.author.tag} | Warning: Status board update failed`,
                            iconURL: message.author.displayAvatarURL()
                        })]
                    });

                    const adminChannel = await message.client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
                    if (adminChannel) {
                        await adminChannel.send({
                            content: `<@${ALLOWED_USER_ID}>`,
                            embeds: [new EmbedBuilder()
                                .setTitle('Status Board Update Failed')
                                .setDescription(`Manual edit was successful but status board failed to update for ${message.author.tag}'s editmm command`)
                                .setColor('#ff0000')
                                .addFields(
                                    { name: 'User', value: `<@${userId}>`, inline: true },
                                    { name: 'Action', value: action, inline: true },
                                    { name: 'Amount', value: `⏣ ${formatNumber(amount)}`, inline: true }
                                )
                            ]
                        });
                    }
                }
            } catch (statusError) {
                console.error('Failed to update status board:', statusError);
                await reply.edit({
                    embeds: [embed.setFooter({
                        text: `${message.author.tag} | Error: Status board update failed`,
                        iconURL: message.author.displayAvatarURL()
                    })]
                });
            }

        } catch (error) {
            console.error('Error in editmm command:', error);
            return message.reply('An error occurred while processing the command. Please check the server logs.');
        }
    },
};