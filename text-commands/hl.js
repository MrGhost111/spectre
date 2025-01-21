const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const REQUIRED_ROLES = [
    '1030707878597763103',
    '783032959350734868',
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
        .setTitle('Highlight')
        .setDescription(`❌ ${message}`)
        .setTimestamp();
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return Math.floor(date.getTime() / 1000);
}

function checkHighlightMatch(messageWord, highlightWord, blacklistedWords) {
    messageWord = messageWord.toLowerCase();
    highlightWord = highlightWord.toLowerCase();
    
    if (blacklistedWords?.some(word => messageWord.includes(word.toLowerCase()))) {
        return false;
    }
    
    return messageWord.includes(highlightWord);
}

async function checkMessageForHighlights(client, message) {
    const highlights = loadHighlights();
    const messageWords = message.content.toLowerCase().split(/\s+/);
    const notifiedUsers = new Set();

    const THRESHOLD_TIME = 60 * 1000;
    const currentTime = Date.now();

    let recentMessages = [];
    try {
        if (!message.channel?.messages?.fetch) {
            return;
        }

        const fetchedMessages = await message.channel.messages.fetch({ limit: 20 })
            .catch(() => null);
        
        recentMessages = fetchedMessages ? Array.from(fetchedMessages.values()) : [];
        
    } catch {
        recentMessages = [];
    }

    for (const [userId, userData] of Object.entries(highlights)) {
        if (userId === message.author.id) continue;

        if (!userData.words || userData.words.length === 0) continue;

        if (userData.blacklist) {
            if (userData.blacklist.channels?.includes(message.channel.id)) continue;
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

                    const contextMessages = await message.channel.messages.fetch({ 
                        limit: 3, 
                        before: message.id 
                    });

                    const formattedContextMessages = Array.from(contextMessages.values())
                        .reverse()
                        .map(m => `**[<t:${formatTimestamp(m.createdTimestamp)}:t>]** **${m.author.tag}**: ${m.content}`);

                    const highlightEmbed = new EmbedBuilder()
                        .setColor(0x0099ff)
                        .setTitle(`Triggered word: ${word}`)
                        .setDescription(
                            `**Channel:** <#${message.channel.id}>\n` +
                            `**Context:**\n` +
                            `${formattedContextMessages.join('\n')}\n` +
                            `**[<t:${formatTimestamp(message.createdTimestamp)}:t>]** **${message.author.tag}**: ${message.content}\n\n` +
                            `**Jump to Message:**\n` +
                            `[Click here](${message.url})`
                        )
                        .setFooter({ 
                            text: message.createdAt.toLocaleDateString('en-US', {
                                year: 'numeric', 
                                month: '2-digit', 
                                day: '2-digit'
                            })
                        });

                    await user.send({ embeds: [highlightEmbed] });
                } catch (error) {
                    console.error(`Failed to send highlight notification to user ${userId}:`, error);
                }
                break;
            }
        }
    }
}

module.exports = {
    loadHighlights,
    saveHighlights,
    hasRequiredRole,
    createErrorEmbed,
    checkMessageForHighlights,
    MAX_HIGHLIGHTS,
    MAX_BLACKLIST
};

module.exports = {
    name: 'highlight',
    aliases: ['hl'],
    checkMessageForHighlights,
    async execute(message, args) {
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
                            name: `📝 Highlight Words (${userData.words.length}/${MAX_HIGHLIGHTS})`,
                            value: userData.words.length > 0 ? userData.words.join('\n') : 'No highlights set',
                            inline: false
                        },
                        {
                            name: `🚫 Blacklisted Words (${userData.blacklist.words.length}/${MAX_BLACKLIST})`,
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
                            name: `📺 Blacklisted Channels (${userData.blacklist.channels.length}/${MAX_BLACKLIST})`,
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
                    .setTitle('📌 Highlight Command Help')
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
    }
};
