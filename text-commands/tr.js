const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Constants
const ANNOUNCEMENT_CHANNEL_ID = '833241820959473724';
const TRANSACTION_CHANNEL_ID = '833246120389902356';
const TIER_1_ROLE_ID = '783032959350734868';
const TIER_2_ROLE_ID = '1038888209440067604';
const PRO_MAKER_ROLE_ID = '838478632451178506';
const TIER_1_REQUIREMENT = 35000000;
const TIER_2_REQUIREMENT = 70000000;

// File paths
const usersFilePath = path.join(__dirname, '../data/users.json');
const statsFilePath = path.join(__dirname, '../data/stats.json');

// Helper function for number formatting
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

async function getWeeklyStats(client, guild) {
    try {
        const usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
        const tier1Users = [];
        const tier2Users = [];
        const members = await guild.members.fetch();

        for (const [userId, userData] of Object.entries(usersData)) {
            if (!userData.weeklyDonated) continue;
            const member = members.get(userId);
            if (!member) continue;

            const userInfo = {
                id: userId,
                weeklyDonated: userData.weeklyDonated,
                requirement: member.roles.cache.has(TIER_2_ROLE_ID) 
                    ? TIER_2_REQUIREMENT 
                    : TIER_1_REQUIREMENT
            };

            if (member.roles.cache.has(TIER_2_ROLE_ID)) {
                tier2Users.push(userInfo);
            } else if (member.roles.cache.has(TIER_1_ROLE_ID)) {
                tier1Users.push(userInfo);
            }
        }

        tier1Users.sort((a, b) => b.weeklyDonated - a.weeklyDonated);
        tier2Users.sort((a, b) => b.weeklyDonated - a.weeklyDonated);

        return { tier1Users, tier2Users };
    } catch (error) {
        console.error('Error getting weekly stats:', error);
        return { tier1Users: [], tier2Users: [] };
    }
}

module.exports = {
    name: 'testreset',
    aliases: ['tr', 'simreset'],
    description: 'Test the weekly reset process without affecting real data',
    async execute(client, message, args) {
        // First check if we have a valid message object
        if (!message) {
            console.error('Message object is undefined');
            return;
        }

        // Then check if we have a channel to send messages to
        if (!message.channel) {
            console.error('Message channel is undefined');
            // Try to get a fallback channel if possible
            if (client.channels.cache.has(ANNOUNCEMENT_CHANNEL_ID)) {
                message.channel = client.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID);
            } else {
                console.error('No fallback channel available');
                return;
            }
        }

        try {
            // Check if command is being run in a guild
            if (!message.guild) {
                return await message.channel.send('❌ This command must be run in a server.');
            }

            // Check permissions
            if (!message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return await message.channel.send('❌ You need administrator permissions to use this command.');
            }

            // Start the simulation
            await message.channel.send('🧪 **TEST MODE** - Starting weekly reset simulation...');

            // Load data
            let usersData = {};
            let statsData = {};
            
            try {
                usersData = fs.existsSync(usersFilePath) 
                    ? JSON.parse(fs.readFileSync(usersFilePath, 'utf8')) 
                    : {};
                statsData = fs.existsSync(statsFilePath) 
                    ? JSON.parse(fs.readFileSync(statsFilePath, 'utf8')) 
                    : { totalDonations: 0 };
            } catch (error) {
                return await message.channel.send(`❌ Error loading data: ${error.message}`);
            }

            // Process data
            const guild = message.guild;
            const members = await guild.members.fetch();
            const summary = { demotions: [], promotions: [] };
            let topDonor = null;
            let topDonation = 0;
            let weeklyDonations = 0;
            const tier2Donations = [];

            for (const [userId, userData] of Object.entries(usersData)) {
                weeklyDonations += userData.weeklyDonated || 0;
                if (userData.weeklyDonated > topDonation) {
                    topDonor = userId;
                    topDonation = userData.weeklyDonated;
                }

                const member = members.get(userId);
                if (!member) continue;

                const isTier2 = member.roles.cache.has(TIER_2_ROLE_ID);
                const isTier1 = member.roles.cache.has(TIER_1_ROLE_ID);

                if (isTier2 && userData.weeklyDonated > 0) {
                    tier2Donations.push({
                        id: userId,
                        donated: userData.weeklyDonated
                    });
                }

                // Simulate promotions/demotions
                if (isTier1 && !isTier2 && userData.weeklyDonated >= TIER_2_REQUIREMENT) {
                    summary.promotions.push({
                        userId,
                        donated: userData.weeklyDonated,
                        newTier: 2
                    });
                } else if (isTier2 && userData.weeklyDonated < TIER_2_REQUIREMENT) {
                    summary.demotions.push({
                        userId,
                        fromTier: 2,
                        toTier: 1,
                        missedBy: TIER_2_REQUIREMENT - userData.weeklyDonated
                    });
                } else if (isTier1 && userData.weeklyDonated < TIER_1_REQUIREMENT) {
                    summary.demotions.push({
                        userId,
                        fromTier: 1,
                        toTier: 0,
                        missedBy: TIER_1_REQUIREMENT - userData.weeklyDonated
                    });
                }
            }

            // Generate and send reports
            const { tier1Users, tier2Users } = await getWeeklyStats(client, guild);
            
            // Weekly stats embed
            const weeklyStatsEmbed = new EmbedBuilder()
                .setTitle('📊 Weekly Stats (Simulation)')
                .setColor('#4c00b0')
                .addFields(
                    {
                        name: 'Tier 2 Donors',
                        value: tier2Users.length > 0 
                            ? tier2Users.map((u, i) => `${i+1}. <@${u.id}> ⏣ ${formatNumber(u.weeklyDonated)}`).join('\n')
                            : 'None',
                        inline: true
                    },
                    {
                        name: 'Tier 1 Donors',
                        value: tier1Users.length > 0 
                            ? tier1Users.map((u, i) => `${i+1}. <@${u.id}> ⏣ ${formatNumber(u.weeklyDonated)}`).join('\n')
                            : 'None',
                        inline: true
                    }
                );

            await message.channel.send({ 
                content: `**Simulated Weekly Reset**\nTotal collected: ⏣ ${formatNumber(weeklyDonations)}`,
                embeds: [weeklyStatsEmbed] 
            });

            // Final summary
            const summaryEmbed = new EmbedBuilder()
                .setTitle('📝 Simulation Summary')
                .setColor('#4c00b0')
                .addFields(
                    {
                        name: 'Promotions',
                        value: summary.promotions.length > 0
                            ? summary.promotions.map(p => `<@${p.userId}> (⏣ ${formatNumber(p.donated)})`).join('\n')
                            : 'None'
                    },
                    {
                        name: 'Demotions',
                        value: summary.demotions.length > 0
                            ? summary.demotions.map(d => `<@${d.userId}> (Missed by ⏣ ${formatNumber(d.missedBy)})`).join('\n')
                            : 'None'
                    }
                );

            await message.channel.send({ 
                content: '✅ Simulation complete (no changes were made)',
                embeds: [summaryEmbed] 
            });

        } catch (error) {
            console.error('Error in testreset:', error);
            if (message.channel) {
                await message.channel.send(`❌ Error: ${error.message}`);
            } else {
                console.error('Could not send error message - no channel available');
            }
        }
    }
};
