const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { checkMessageForHighlights } = require('../text-commands/hl.js');

// Constants for donation tracking
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

let lastStickyMessageId = null;

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

// Create a blacklist file path
const blacklistPath = path.join(__dirname, '../data/word_blacklist.json');

// Initialize blacklist if it doesn't exist
if (!fs.existsSync(blacklistPath)) {
    fs.writeFileSync(blacklistPath, JSON.stringify({
        "1346427004299378718": [] // One word story channel ID with empty blacklist initially
    }, null, 2), 'utf8');
}

module.exports = {
    name: 'messageCreate',
    async execute(client, message) {
        // One Word Story moderation
        if (message.channelId === '1346427004299378718' && !message.author.bot) {
            try {
                const blacklistData = JSON.parse(fs.readFileSync(blacklistPath, 'utf8'));
                const channelBlacklist = blacklistData[message.channelId] || [];

                // Check if message contains more than one word with punctuation handling
                const messageContent = message.content.trim();
                const words = messageContent.split(/\s+/);
                const wordCount = words.length;

                // Simple check: if we have 2 words, check if one is pure punctuation
                let isValidMessage = false;

                if (wordCount === 1) {
                    // Single word is always valid (subject to blacklist)
                    isValidMessage = true;
                } else if (wordCount === 2) {
                    // Check if either word is pure punctuation
                    const isPunctuation = (word) => /^[.,!?;:"'()\[\]{}…&-]+$/.test(word);

                    if (isPunctuation(words[0]) || isPunctuation(words[1])) {
                        isValidMessage = true;
                    }
                }

                if (!isValidMessage) {
                    await message.delete();
                    const warningMsg = await message.channel.send(
                        `<@${message.author.id}> Only one word is allowed in this channel! You can include standalone punctuation.`
                    );

                    // Delete the warning after 5 seconds
                    setTimeout(async () => {
                        try {
                            await warningMsg.delete();
                        } catch (err) {
                            console.error('Error deleting warning message:', err);
                        }
                    }, 5000);

                    return;
                }

                // Get the actual word (non-punctuation) for blacklist checking
                let wordToCheck = messageContent;
                if (wordCount === 2) {
                    // Find which part is the actual word
                    const isPunctuation = (word) => /^[.,!?;:"'()\[\]{}…&-]+$/.test(word);
                    wordToCheck = isPunctuation(words[0]) ? words[1] : words[0];
                }

                // Enhanced blacklist check - check if any blacklisted word is contained within the message
                const wordLower = wordToCheck.toLowerCase();
                if (channelBlacklist.some(blacklistedWord => {
                    // Check if the word contains any blacklisted word
                    const blacklistedWordLower = blacklistedWord.toLowerCase();
                    return wordLower.includes(blacklistedWordLower) ||
                        // Or check if blacklisted word is a root of the current word
                        (blacklistedWordLower.length > 3 && wordLower.startsWith(blacklistedWordLower));
                })) {
                    await message.delete();
                    const warningMsg = await message.channel.send(
                        `<@${message.author.id}> That word is blacklisted in this channel.`
                    );

                    // Delete the warning after 5 seconds
                    setTimeout(async () => {
                        try {
                            await warningMsg.delete();
                        } catch (err) {
                            console.error('Error deleting warning message:', err);
                        }
                    }, 5000);

                    return;
                }
            } catch (error) {
                console.error('Error checking one word story:', error);
            }
        }

        // Check for blacklist management command - Allow specific user ID in addition to manage messages perm
        if (message.content.startsWith(',blacklist') &&
            (message.member.permissions.has('ManageMessages') || message.author.id === '753491023208120321')) {
            const args = message.content.slice(',blacklist'.length).trim().split(/ +/);
            const action = args[0]?.toLowerCase();
            const channelId = args[1] || '1346427004299378718'; // Default to one word story channel

            // Load current blacklist
            let blacklistData = {};
            try {
                blacklistData = JSON.parse(fs.readFileSync(blacklistPath, 'utf8'));
                if (!blacklistData[channelId]) {
                    blacklistData[channelId] = [];
                }
            } catch (error) {
                console.error('Error loading blacklist:', error);
                blacklistData[channelId] = [];
            }

            if (action === 'add' && args.length > 2) {
                // Add words to blacklist
                const wordsToAdd = args.slice(2).join(' ').split(',').map(word => word.trim());

                for (const word of wordsToAdd) {
                    if (word && !blacklistData[channelId].includes(word)) {
                        blacklistData[channelId].push(word);
                    }
                }

                fs.writeFileSync(blacklistPath, JSON.stringify(blacklistData, null, 2), 'utf8');
                message.reply(`Added ${wordsToAdd.length} word(s) to the blacklist for channel <#${channelId}>.`);
                return;
            } else if (action === 'remove' && args.length > 2) {
                // Remove words from blacklist
                const wordsToRemove = args.slice(2).join(' ').split(',').map(word => word.trim());
                const initialCount = blacklistData[channelId].length;

                blacklistData[channelId] = blacklistData[channelId].filter(
                    word => !wordsToRemove.includes(word)
                );

                fs.writeFileSync(blacklistPath, JSON.stringify(blacklistData, null, 2), 'utf8');
                message.reply(`Removed ${initialCount - blacklistData[channelId].length} word(s) from the blacklist for channel <#${channelId}>.`);
                return;
            } else if (action === 'list') {
                // List blacklisted words
                if (blacklistData[channelId].length === 0) {
                    message.reply(`No words are blacklisted in channel <#${channelId}>.`);
                } else {
                    message.reply(`Blacklisted words in <#${channelId}>: ${blacklistData[channelId].join(', ')}`);
                }
                return;
            } else if (action === 'clear') {
                // Clear all blacklisted words
                blacklistData[channelId] = [];
                fs.writeFileSync(blacklistPath, JSON.stringify(blacklistData, null, 2), 'utf8');
                message.reply(`Cleared the blacklist for channel <#${channelId}>.`);
                return;
            } else {
                message.reply('Usage: `,blacklist [add/remove/list/clear] [channelId] [word1,word2,...]`');
                return;
            }
        }

        if (message.channelId === '673970943244369930' && message.author.id !== client.user.id) {
            try {
                if (lastStickyMessageId) {
                    try {
                        const oldMessage = await message.channel.messages.fetch(lastStickyMessageId);
                        if (oldMessage) {
                            await oldMessage.delete();
                        }
                    } catch (error) {
                        console.error('Error deleting old sticky message:', error);
                    }
                }

                const stickyMessage = await message.channel.send(
                    "Annoyed by these pings? get no partnership ping from https://discord.com/channels/673970118744735764/1317992115917295647/1321411901330165770"
                );
                lastStickyMessageId = stickyMessage.id;
            } catch (error) {
                console.error('Error handling sticky message:', error);
            }
        }

        // Track donation messages from Dank Memer bot
        if (message.author.id === DANK_MEMER_BOT_ID && message.channel.id === TRANSACTION_CHANNEL_ID) {
            if (message.embeds?.length > 0) {
                const embed = message.embeds[0];

                // Check for donation confirmation embed (successful donation)
                if (embed.description && embed.description.includes('Successfully donated')) {
                    const donationMatch = embed.description.match(/Successfully donated \*\*⏣\s*([\d,]+)\*\*/);
                    if (!donationMatch) return;

                    const donationAmount = parseInt(donationMatch[1].replace(/,/g, ''), 10);
                    const donorId = await findCommandUser(message);
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

                    await message.channel.send({ embeds: [donationEmbed] });

                    // Update status board in the background
                    setImmediate(() => {
                        updateStatusBoard(client).catch(console.error);
                    });
                }
                // Check for donation confirmation request embed
                else if (embed.description && embed.description.includes('Are you sure you want to donate your coins?')) {
                    try {
                        // Extract the donation amount from the embed description
                        const amountMatch = embed.description.match(/donate \*\*⏣ ([0-9,]+)\*\*/);
                        if (amountMatch) {
                            const donationAmount = amountMatch[1]; // This will keep the commas for readability

                            // Get the user who initiated the interaction (the donor)
                            const donorId = message.interaction?.user?.id;
                            const donorTag = message.interaction?.user?.tag || 'Unknown User';

                            if (donorId) {
                                // Create a response embed
                                const donationEmbed = new EmbedBuilder()
                                    .setColor('#2ecc71')
                                    .setTitle('Donation Detected')
                                    .setDescription(`<@${donorId}> is donating **⏣ ${donationAmount}** coins!`)
                                    .setFooter({
                                        text: `Donor: ${donorTag} | ID: ${donorId}`
                                    })
                                    .setTimestamp();

                                // Send the donation notification
                                await message.channel.send({ embeds: [donationEmbed] });

                                // Also track this donation for confirmation later
                                client.trackedDonations = client.trackedDonations || new Map();
                                client.trackedDonations.set(message.id, {
                                    originalMessage: message,
                                    user: donorId,
                                    amount: donationAmount
                                });

                                console.log(`Tracking pending donation: Message ID ${message.id}, User ${donorId}, Amount ${donationAmount}`);
                            }
                        }
                    } catch (error) {
                        console.error('Error processing donation embed:', error);
                    }
                }
            }
        }

        // Auto react for specific channel
        if (message.channelId === '1299069910751903857') {
            try {
                await message.react('<:upvote:1303963379945181224>');
                await message.react('<:downvote:1303963004915679232>');
            } catch (error) {
                console.error('Error adding reactions:', error);
            }
        }

        const logChannelId = '762404827698954260';
        const faceRevealChannelId = '721347947463180319';
        const blacklistedCategories = [
            '799997847931977749',
            '833240903611056198',
            '721337782546726932',
            '842471433238347786',
            '1064095644811284490',
            '720398363186692216'
        ];

        if (!message.author.bot &&
            message.channelId !== faceRevealChannelId &&
            message.channel.parentId &&
            !blacklistedCategories.includes(message.channel.parentId)) {

            const hasImage = message.attachments.some(attachment =>
                attachment.contentType?.startsWith('image/')) ||
                /(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))/i.test(message.content);

            if (hasImage) {
                try {
                    const logChannel = await client.channels.fetch(logChannelId);
                    if (logChannel) {
                        const embed = new EmbedBuilder()
                            .setColor('#00ff00')
                            .setAuthor({
                                name: message.author.tag,
                                iconURL: message.author.displayAvatarURL({ dynamic: true })
                            })
                            .setTimestamp()
                            .addFields(
                                { name: 'Author ID', value: message.author.id },
                                { name: 'Channel', value: `<#${message.channel.id}>` },
                                { name: 'Message Link', value: `[Jump to Message](${message.url})` }
                            );

                        const imageUrls = [];
                        message.attachments.forEach(attachment => {
                            if (attachment.contentType?.startsWith('image/')) {
                                imageUrls.push(attachment.url);
                            }
                        });

                        const imageMatches = [...message.content.matchAll(/(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))/gi)];
                        imageMatches.forEach(match => imageUrls.push(match[0]));

                        if (imageUrls.length > 0) {
                            embed.setImage(imageUrls[0]);
                            await logChannel.send({ embeds: [embed] });

                            for (let i = 1; i < imageUrls.length; i++) {
                                const additionalEmbed = new EmbedBuilder()
                                    .setColor('#00ff00')
                                    .setAuthor({
                                        name: message.author.tag,
                                        iconURL: message.author.displayAvatarURL({ dynamic: true })
                                    })
                                    .setTimestamp()
                                    .setImage(imageUrls[i]);
                                await logChannel.send({ embeds: [additionalEmbed] });
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error logging image:', error);
                }
            }
        }

        if (message.content.startsWith('!muterole update')) {
            const eventChannelIds = [
                '1296077996435832902',
                '815478998283976704',
                '850431178170433556',
                '944923216982470656',
                '710788619719409695',
                '944924520647643156'
            ];

            const mutedRoleId = '673978861335085107';

            await message.channel.send('Waiting for Carl...');

            setTimeout(async () => {
                try {
                    for (const channelId of eventChannelIds) {
                        const channel = await message.guild.channels.fetch(channelId);
                        if (channel) {
                            await channel.permissionOverwrites.edit(mutedRoleId, { ViewChannel: null, SendMessages: null });
                            console.log(`Updated permissions for muted role in channel: ${channel.id}`);
                        } else {
                            console.log(`Channel not found: ${channelId}`);
                        }
                    }
                    await message.channel.send('Fixed Carls skill issue by reverting changes made to event channels.');
                } catch (error) {
                    console.error('Error updating permissions:', error);
                    await message.channel.send('There was an error updating permissions. Please try again.');
                }
            }, 5000);
            return;
        }

        const prefix = ',';

        if (!message.content.startsWith(prefix)) {
            if (!message.guild) return;
            try {
                await checkMessageForHighlights(client, message);
            } catch (error) {
                console.error('Error checking highlights:', error);
            }
            return;
        }

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        const command = client.textCommands.get(commandName) ||
            client.textCommands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

        if (!command) return;

        if (commandName === 'resetsns') {
            if (!message.member.permissions.has('Administrator')) {
                return message.reply('You do not have permission to use this command.');
            }

            const donoLogsPath = path.join(__dirname, '../data/donoLogs.json');
            fs.writeFileSync(donoLogsPath, JSON.stringify({}, null, 2), 'utf8');
            return message.reply('Successfully reset the donation note tracking system!');
        }

        if (commandName === 'lb') {
            const donoLogsPath = path.join(__dirname, '../data/donoLogs.json');
            const donoLogs = JSON.parse(fs.readFileSync(donoLogsPath, 'utf8'));

            const sortedUsers = Object.entries(donoLogs)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10);

            if (sortedUsers.length === 0) {
                return message.reply('No donation notes have been set yet!');
            }

            let lbMessage = '**🏆 Donation Note Setters Leaderboard**\n\n';
            for (let i = 0; i < sortedUsers.length; i++) {
                const [userId, count] = sortedUsers[i];
                lbMessage += `${i + 1}. <@${userId}>: ${count} notes\n`;
            }

            return message.reply(lbMessage);
        }

        try {
            await command.execute(message, args);
        } catch (error) {
            console.error(`Error executing command ${commandName}:`, error);
            await message.reply('There was an error trying to execute that command!').catch(console.error);
        }
    },

    // Export the weeklyReset function so it can be used elsewhere
    weeklyReset: async function (client) {
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
};