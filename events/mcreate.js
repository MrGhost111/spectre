const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const REQUIRED_ROLES = [
    '1030707878597763103',
    '768448257495531570',
    '866641249452556309',
    '765988972596822036'
];

const MAX_HIGHLIGHTS = 10;
const MAX_BLACKLIST = 10;

function loadHighlights() {
    const highlightsPath = path.join(__dirname, '../data/highlights.json');
    if (!fs.existsSync(highlightsPath)) {
        fs.writeFileSync(highlightsPath, JSON.stringify({}, null, 2), 'utf8');
        return {};
    }
    return JSON.parse(fs.readFileSync(highlightsPath, 'utf8'));
}

function saveHighlights(data) {
    const highlightsPath = path.join(__dirname, '../data/highlights.json');
    fs.writeFileSync(highlightsPath, JSON.stringify(data, null, 2), 'utf8');
}

function hasRequiredRole(member) {
    return REQUIRED_ROLES.some(roleId => member.roles.cache.has(roleId));
}

function createErrorEmbed(message) {
    return new EmbedBuilder()
        .setColor(0xFF0000)
        .setDescription(`❌ ${message}`)
        .setTimestamp();
}

function checkHighlightMatch(messageWord, highlightWord, blacklistedWords) {
    messageWord = messageWord.toLowerCase();
    highlightWord = highlightWord.toLowerCase();
    
    if (blacklistedWords?.some(word => messageWord.includes(word.toLowerCase()))) {
        return false;
    }
    
    return messageWord.includes(highlightWord);
}

module.exports = {
    name: 'messageCreate',
    async execute(client, message) {
        if (message.channelId === '1299069910751903857') {
            try {
                await message.react('<:upvote:1303963379945181224>');
                await message.react('<:downvote:1303963004915679232>');
            } catch (error) {
                return;
            }
        }

        if (message.author.bot) {
            if (message.author.id === '270904126974590976' && message.embeds.length > 0) {
                const embed = message.embeds[0];
                const itemName = embed.title || 'Unknown Item';
                const averageValueField = embed.fields.find(field => field.name === 'Market' && field.value.includes('Average Value'));
                if (averageValueField) {
                    const averageValueMatch = averageValueField.value.match(/Average Value:\s*⏣\s*([0-9,]+)/);
                    if (averageValueMatch) {
                        const averageValue = parseInt(averageValueMatch[1].replace(/,/g, ''), 10);
                        const itemsPath = path.join(__dirname, '../data/items.json');
                        let items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
                        if (!(itemName in items)) {
                            items[itemName] = averageValue;
                            message.channel.send(`Added item **${itemName}** with price **${averageValue}** coins.`);
                        } else if (items[itemName] !== averageValue) {
                            items[itemName] = averageValue;
                            message.channel.send(`Updated item **${itemName}**'s price to **${averageValue}** coins.`);
                        }
                        fs.writeFileSync(itemsPath, JSON.stringify(items, null, 2), 'utf8');
                    }
                }
            }
            return;
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

            const highlights = loadHighlights();
            const messageWords = message.content.toLowerCase().split(/\s+/);
            const notifiedUsers = new Set();

            const THRESHOLD_TIME = 60 * 1000;
            const currentTime = Date.now();

            let recentMessages;
try {
    recentMessages = await message.channel.messages.fetch({ limit: 50 });
} catch (error) {
    console.error('Error fetching recent messages:', error);
    recentMessages = new Map(); // Provide an empty Map to prevent further errors
}

            for (const [userId, userData] of Object.entries(highlights)) {
                if (userId === message.author.id) continue;

                // Skip if user has no highlights
                if (!userData.words || userData.words.length === 0) continue;

                // Check blacklists
                if (userData.blacklist) {
                    // Skip if channel is blacklisted
                    if (userData.blacklist.channels?.includes(message.channel.id)) continue;
                    
                    // Skip if user is blacklisted
                    if (userData.blacklist.users?.includes(message.author.id)) continue;
                }

                const member = await message.guild.members.fetch(userId).catch(() => null);
                if (!member) continue;

                const canViewChannel = message.channel.permissionsFor(member)?.has('ViewChannel');
                if (!canViewChannel) continue;

                const wasRecentlyActive = recentMessages.some(msg => 
                    msg.author.id === userId && (currentTime - msg.createdTimestamp <= THRESHOLD_TIME)
                );

                if (wasRecentlyActive) continue;

                for (const word of userData.words) {
                    const hasMatch = messageWords.some(messageWord => 
                        checkHighlightMatch(messageWord, word, userData.blacklist?.words)
                    );

                    if (hasMatch && !notifiedUsers.has(userId)) {
                        notifiedUsers.add(userId);
                        try {
                            const user = await client.users.fetch(userId);
                            const notificationEmbed = new EmbedBuilder()
                                .setColor(0x0099ff)
                                .setTitle('You were highlighted')
                                .addFields(
                                    {
                                        name: 'Word',
                                        value: word
                                    },
                                    {
                                        name: 'Message',
                                        value: message.content.length > 1024 ? 
                                            message.content.substring(0, 1021) + '...' : 
                                            message.content
                                    },
                                    {
                                        name: 'Author',
                                        value: message.author.tag
                                    },
                                    {
                                        name: 'Link',
                                        value: message.url
                                    }
                                )
                                .setTimestamp();

                            await user.send({ embeds: [notificationEmbed] });
                        } catch (error) {
                            console.error(`Failed to send highlight notification to user ${userId}:`, error);
                        }
                        break;
                    }
                }
            }
            return;
        }

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const fullCommand = args.shift().toLowerCase();
        const textCommand = client.textCommands.find(cmd => fullCommand.startsWith(cmd.name));

        if (fullCommand === 'resetsns') {
            if (!message.member.permissions.has('ADMINISTRATOR')) {
                return message.reply('You do not have permission to use this command.');
            }

            const donoLogsPath = path.join(__dirname, '../data/donoLogs.json');
            fs.writeFileSync(donoLogsPath, JSON.stringify({}, null, 2), 'utf8');
            return message.reply('Successfully reset the donation note tracking system!');
        }

        if (fullCommand === 'lb') {
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
if (fullCommand === 'highlight' || fullCommand === 'hl') {
            if (!message.guild) {
                return message.reply({ 
                    embeds: [createErrorEmbed('This command can only be used in a server!')] 
                });
            }

            if (!hasRequiredRole(message.member)) {
                return message.reply({ 
                    embeds: [createErrorEmbed('This command is a server perk. Please check <#862927749802885150> for more info.')] 
                });
            }

            const highlights = loadHighlights();
            const subCommand = args[0]?.toLowerCase();
            
            if (!highlights[message.author.id]) {
                highlights[message.author.id] = {
                    words: [],
                    blacklist: {
                        words: [],
                        users: [],
                        channels: []
                    }
                };
            }

            // Convert old format to new format if needed
            if (Array.isArray(highlights[message.author.id])) {
                const oldWords = highlights[message.author.id];
                highlights[message.author.id] = {
                    words: oldWords,
                    blacklist: {
                        words: [],
                        users: [],
                        channels: []
                    }
                };
            }

            // Ensure blacklist exists
            if (!highlights[message.author.id].blacklist) {
                highlights[message.author.id].blacklist = {
                    words: [],
                    users: [],
                    channels: []
                };
            }

            const userData = highlights[message.author.id];

            switch (subCommand) {
                case 'add': {
                    const word = args.slice(1).join(' ').toLowerCase();
                    if (!word) {
                        return message.reply({ 
                            embeds: [createErrorEmbed('Please specify a word to highlight!')] 
                        });
                    }
                    if (word.length < 3) {
                        return message.reply({ 
                            embeds: [createErrorEmbed('Highlight words must be at least 3 characters long!')] 
                        });
                    }
                    
                    if (userData.words.length >= MAX_HIGHLIGHTS) {
                        return message.reply({ 
                            embeds: [createErrorEmbed(`You can only have up to ${MAX_HIGHLIGHTS} highlight words!`)] 
                        });
                    }
                    
                    if (!userData.words.includes(word)) {
                        userData.words.push(word);
                        saveHighlights(highlights);
                        
                        const successEmbed = new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setDescription(`✅ Added "${word}" to your highlights`)
                            .setTimestamp();
                        message.reply({ embeds: [successEmbed] });
                    } else {
                        message.reply({ 
                            embeds: [createErrorEmbed('That word is already in your highlights!')] 
                        });
                    }
                    break;
                }

                case 'remove': {
                    const wordToRemove = args.slice(1).join(' ').toLowerCase();
                    if (!wordToRemove) {
                        return message.reply({ 
                            embeds: [createErrorEmbed('Please specify a word to remove!')] 
                        });
                    }
                    
                    const index = userData.words.indexOf(wordToRemove);
                    if (index > -1) {
                        userData.words.splice(index, 1);
                        saveHighlights(highlights);
                        
                        const successEmbed = new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setDescription(`✅ Removed "${wordToRemove}" from your highlights`)
                            .setTimestamp();
                        message.reply({ embeds: [successEmbed] });
                    } else {
                        message.reply({ 
                            embeds: [createErrorEmbed('That word is not in your highlights!')] 
                        });
                    }
                    break;
                }
case 'blacklist': {
                    const blacklistType = args[1]?.toLowerCase();
                    const blacklistAction = args[2]?.toLowerCase();
                    const target = args.slice(3).join(' ');

                    if (!blacklistType || !['word', 'user', 'channel'].includes(blacklistType)) {
                        return message.reply({ 
                            embeds: [createErrorEmbed('Please specify what to blacklist (word/user/channel)!')] 
                        });
                    }

                    if (!blacklistAction || !['add', 'remove'].includes(blacklistAction)) {
                        return message.reply({ 
                            embeds: [createErrorEmbed('Please specify the action (add/remove)!')] 
                        });
                    }

                    if (!target) {
                        return message.reply({ 
                            embeds: [createErrorEmbed(`Please specify the ${blacklistType} to ${blacklistAction}!`)] 
                        });
                    }

                    const blacklistKey = `${blacklistType}s`;
                    let targetValue = target;

                    // Handle mentions for users and channels
                    if (blacklistType === 'user') {
                        const userId = target.replace(/[<@!>]/g, '');
                        try {
                            await message.guild.members.fetch(userId);
                            targetValue = userId;
                        } catch {
                            return message.reply({ 
                                embeds: [createErrorEmbed('Invalid user! Please mention a valid user or provide their ID.')] 
                            });
                        }
                    } else if (blacklistType === 'channel') {
                        const channelId = target.replace(/[<#>]/g, '');
                        const channel = message.guild.channels.cache.get(channelId);
                        if (!channel) {
                            return message.reply({ 
                                embeds: [createErrorEmbed('Invalid channel! Please mention a valid channel or provide its ID.')] 
                            });
                        }
                        targetValue = channelId;
                    }

                    if (blacklistAction === 'add') {
                        if (userData.blacklist[blacklistKey].length >= MAX_BLACKLIST) {
                            return message.reply({ 
                                embeds: [createErrorEmbed(`You can only blacklist up to ${MAX_BLACKLIST} ${blacklistType}s!`)] 
                            });
                        }

                        if (!userData.blacklist[blacklistKey].includes(targetValue)) {
                            userData.blacklist[blacklistKey].push(targetValue);
                            saveHighlights(highlights);
                            
                            const successEmbed = new EmbedBuilder()
                                .setColor(0x00FF00)
                                .setDescription(`✅ Added ${blacklistType} "${target}" to your blacklist`)
                                .setTimestamp();
                            message.reply({ embeds: [successEmbed] });
                        } else {
                            message.reply({ 
                                embeds: [createErrorEmbed(`That ${blacklistType} is already in your blacklist!`)] 
                            });
                        }
                    } else {
                        const index = userData.blacklist[blacklistKey].indexOf(targetValue);
                        if (index > -1) {
                            userData.blacklist[blacklistKey].splice(index, 1);
                            saveHighlights(highlights);
                            
                            const successEmbed = new EmbedBuilder()
                                .setColor(0x00FF00)
                                .setDescription(`✅ Removed ${blacklistType} "${target}" from your blacklist`)
                                .setTimestamp();
                            message.reply({ embeds: [successEmbed] });
                        } else {
                            message.reply({ 
                                embeds: [createErrorEmbed(`That ${blacklistType} is not in your blacklist!`)] 
                            });
                        }
                    }
                    break;
                }

                case 'list': {
                    const listEmbed = new EmbedBuilder()
                        .setColor(0x0099FF)
                        .setTitle(`Highlight Settings for ${message.author.tag}`)
                        .addFields(
                            {
                                name: `📝  Highlight Words (${userData.words.length}/${MAX_HIGHLIGHTS})`,
                                value: userData.words.length > 0 ? userData.words.join('\n') : 'No highlights set',
                                inline: false
                            },
                            {
                                name: ` Blacklisted Words (${userData.blacklist.words.length}/${MAX_BLACKLIST})`,
                                value: userData.blacklist.words.length > 0 ? userData.blacklist.words.join('\n') : 'No blacklisted words',
                                inline: false
                            },
                            {
                                name: `👤 Blacklisted Users (${userData.blacklist.users.length}/${MAX_BLACKLIST})`,
                                value: userData.blacklist.users.length > 0 
                                    ? userData.blacklist.users.map(id => `<@${id}>`).join('\n') 
                                    : 'No blacklisted users',
                                inline: false
                            },
                            {
                                name: ` Blacklisted Channels (${userData.blacklist.channels.length}/${MAX_BLACKLIST})`,
                                value: userData.blacklist.channels.length > 0 
                                    ? userData.blacklist.channels.map(id => `<#${id}>`).join('\n') 
                                    : 'No blacklisted channels',
                                inline: false
                            }
                        )
                        .setTimestamp();
                    
                    message.reply({ embeds: [listEmbed] });
                    break;
                }

                default: {
                    const helpEmbed = new EmbedBuilder()
                        .setColor(0x0099FF)
                        .setTitle(' Highlight Command Help')
                        .setDescription('Available Commands:')
                        .addFields(
                            { name: '`,hl add <word>`', value: 'Add a highlight word' },
                            { name: '`,hl remove <word>`', value: 'Remove a highlight word' },
                            { name: '`,hl blacklist word add <word>`', value: 'Add a word to your blacklist' },
                            { name: '`,hl blacklist word remove <word>`', value: 'Remove a word from your blacklist' },
                            { name: '`,hl blacklist user add <@user>`', value: 'Add a user to your blacklist' },
                            { name: '`,hl blacklist user remove <@user>`', value: 'Remove a user from your blacklist' },
                            { name: '`,hl blacklist channel add <#channel>`', value: 'Add a channel to your blacklist' },
                            { name: '`,hl blacklist channel remove <#channel>`', value: 'Remove a channel from your blacklist' },
                            { name: '`,hl list`', value: 'List your highlights and blacklist settings' }
                        )
                        .setFooter({ text: `Maximum ${MAX_HIGHLIGHTS} highlights and ${MAX_BLACKLIST} entries per blacklist type` });
                    
                    message.reply({ embeds: [helpEmbed] });
                }
            }
            return;
        }

        if (textCommand) {
            try {
                await textCommand.execute(message, args);
            } catch (error) {
                console.error(`Error executing text command: ${error}`);
                await message.reply('There was an error trying to execute that command!');
            }
        }
    },
};

