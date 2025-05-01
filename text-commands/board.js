const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Constants - make sure these match your existing setup
const ACTIVITY_CHANNEL_ID = '1327928516662005770';
const TIER_1_ROLE_ID = '783032959350734868';
const TIER_2_ROLE_ID = '1038888209440067604';
const TIER_1_REQUIREMENT = 35000000;
const TIER_2_REQUIREMENT = 70000000;

// File paths
const usersFilePath = path.join(__dirname, '../data/users.json');
const statsFilePath = path.join(__dirname, '../data/stats.json');

// Format number with commas
const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// Ensure file exists
const ensureFileExists = (filePath, defaultContent) => {
    try {
        if (!fs.existsSync(filePath)) {
            // Ensure directory exists
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(filePath, JSON.stringify(defaultContent), 'utf8');
            console.log(`Created file: ${filePath}`);
        }
        return true;
    } catch (error) {
        console.error(`Error ensuring file ${filePath} exists:`, error);
        return false;
    }
};

async function getWeeklyStats(client) {
    console.log('Getting weekly stats...');

    // Ensure files exist
    ensureFileExists(usersFilePath, {});
    ensureFileExists(statsFilePath, { totalDonations: 0 });

    // Load latest data
    let usersData = {};
    let statsData = { totalDonations: 0 };

    try {
        usersData = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
        console.log(`Loaded users data: ${Object.keys(usersData).length} users`);
        statsData = JSON.parse(fs.readFileSync(statsFilePath, 'utf8'));
        console.log(`Loaded stats data, total donations: ${statsData.totalDonations}`);
    } catch (error) {
        console.error('Error reading data files:', error);
        return { tier1Users: [], tier2Users: [], totalDonations: 0 };
    }

    try {
        const guild = client.guilds.cache.first();
        if (!guild) {
            console.error('No guild found in cache');
            return { tier1Users: [], tier2Users: [], totalDonations: statsData.totalDonations || 0 };
        }

        console.log(`Fetching members for guild: ${guild.name}`);
        const members = await guild.members.fetch();
        console.log(`Fetched ${members.size} members`);

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

                const userData = usersData[memberId];
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
        }

        tier2Users.sort((a, b) => b.weeklyDonated - a.weeklyDonated);
        tier1Users.sort((a, b) => b.weeklyDonated - a.weeklyDonated);

        console.log(`Found ${tier1Users.length} tier 1 users and ${tier2Users.length} tier 2 users`);
        return { tier1Users, tier2Users, totalDonations: statsData.totalDonations || 0 };
    } catch (error) {
        console.error('Error processing member data:', error);
        return { tier1Users: [], tier2Users: [], totalDonations: statsData.totalDonations || 0 };
    }
}

module.exports = {
    name: 'board',
    description: 'Sends or updates the donations status board',
    async execute(message, args, client) {
        try {
            console.log(`Board command executed by ${message.author.tag}`);

            // Send initial response
            const initialResponse = await message.channel.send('Creating the status board, please wait...');

            // Get activity channel
            let activityChannel;
            try {
                console.log(`Fetching activity channel: ${ACTIVITY_CHANNEL_ID}`);
                activityChannel = await client.channels.fetch(ACTIVITY_CHANNEL_ID);

                if (!activityChannel) {
                    console.error(`Activity channel not found: ${ACTIVITY_CHANNEL_ID}`);
                    return await initialResponse.edit(`Could not find the activity channel (ID: ${ACTIVITY_CHANNEL_ID})`);
                }

                console.log(`Found activity channel: ${activityChannel.name}`);
            } catch (err) {
                console.error('Error fetching activity channel:', err);
                return await initialResponse.edit(`Error fetching activity channel: ${err.message}`);
            }

            // Get stats
            console.log('Fetching weekly stats');
            const { tier1Users, tier2Users, totalDonations } = await getWeeklyStats(client);

            // Create embed
            console.log('Creating status board embed');
            const embed = new EmbedBuilder()
                .setTitle('<:lbtest:1064919048242090054>  Weekly Donations Leaderboard')
                .setColor('#4c00b0')
                .setTimestamp()
                .setFooter({ text: `Total Server Donations: ⏣ ${formatNumber(totalDonations)}` });

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

            // Send the embed
            try {
                console.log('Sending status board to activity channel');
                await activityChannel.send({ embeds: [embed] });
                console.log('Status board sent successfully');

                // Update initial response
                await initialResponse.edit('Status board has been posted in the activity channel!');
            } catch (sendError) {
                console.error('Error sending status board:', sendError);
                await initialResponse.edit(`Error sending status board: ${sendError.message}`);
            }
        } catch (error) {
            console.error('Error executing board command:', error);
            await message.channel.send(`There was an error creating the status board: ${error.message}`);
        }
    },
};