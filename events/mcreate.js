const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

// Required role IDs for using highlight commands
const REQUIRED_ROLES = [
    '1030707878597763103',
    '768448257495531570',
    '866641249452556309',
    '765988972596822036'
];

const MAX_HIGHLIGHTS = 5;

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

// New function to check if a word matches the highlight
function checkHighlightMatch(messageWord, highlightWord) {
    // Convert both to lowercase for case-insensitive matching
    messageWord = messageWord.toLowerCase();
    highlightWord = highlightWord.toLowerCase();

    // Check if the message word contains the highlight word as a whole word
    return messageWord.includes(highlightWord);

    // Check for plural forms (basic check for 's' at the end)
    if (messageWord === `${highlightWord}s` || messageWord === `${highlightWord}es`) return true;
    if (highlightWord === `${messageWord}s` || highlightWord === `${messageWord}es`) return true;

    return false;
}

module.exports = {
    name: 'messageCreate',
    async execute(client, message) {
        // Handle Dank Memer bot item price detection
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
                        // Path to items.json
                        const itemsPath = path.join(__dirname, '../data/items.json');
                        // Load items from JSON file
                        let items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
                        // Check if item exists and update the price
                        if (!(itemName in items)) {
                            // Item not found, add it
                            items[itemName] = averageValue;
                            message.channel.send(`Added item **${itemName}** with price **${averageValue}** coins.`);
                        } else if (items[itemName] !== averageValue) {
                            // Item found but price is different, update it
                            items[itemName] = averageValue;
                            message.channel.send(`Updated item **${itemName}**'s price to **${averageValue}** coins.`);
                        }
                        // Save updated items to JSON file
                        fs.writeFileSync(itemsPath, JSON.stringify(items, null, 2), 'utf8');
                    }
                }
            }
            return;
        }

        // Handle muterole update command
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

        // Handle highlight notifications for non-command messages
        if (!message.content.startsWith(prefix)) {
            if (!message.guild) return;

            const highlights = loadHighlights();
            const messageWords = message.content.toLowerCase().split(/\s+/);
            const notifiedUsers = new Set();

const THRESHOLD_TIME = 60 * 1000; // 1 minute in milliseconds
const currentTime = Date.now();

// Fetch recent messages and filter based on user activity within the last 1 minute
const recentMessages = await message.channel.messages.fetch({ limit: 50 });

for (const [userId, userHighlights] of Object.entries(highlights)) {
    if (userId === message.author.id) continue;

    const wasRecentlyActive = recentMessages.some(msg => 
        msg.author.id === userId && (currentTime - msg.createdTimestamp <= THRESHOLD_TIME)
    );

    if (wasRecentlyActive) continue;

                for (const word of userHighlights) {
                    // Check each word in the message against the highlight word
                    const hasMatch = messageWords.some(messageWord => 
                        checkHighlightMatch(messageWord, word)
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

        // Rest of the code remains the same...
        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const fullCommand = args.shift().toLowerCase();
        const textCommand = client.textCommands.find(cmd => fullCommand.startsWith(cmd.name));

        // Handle resetsns command
        if (fullCommand === 'resetsns') {
            if (!message.member.permissions.has('ADMINISTRATOR')) {
                return message.reply('You do not have permission to use this command.');
            }

            const donoLogsPath = path.join(__dirname, '../data/donoLogs.json');
            fs.writeFileSync(donoLogsPath, JSON.stringify({}, null, 2), 'utf8');
            return message.reply('Successfully reset the donation note tracking system!');
        }

        // Handle lb command
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

        // Handle highlight commands
        if (fullCommand === 'highlight' || fullCommand === 'hl') {
            if (!message.guild) {
                return message.reply({ 
                    embeds: [createErrorEmbed('This command can only be used in a server!')] 
                });
            }

            if (!hasRequiredRole(message.member)) {
                return message.reply({ 
                    embeds: [createErrorEmbed('You need one of the required roles to use highlight commands!')] 
                });
            }

            const highlights = loadHighlights();
            const subCommand = args[0]?.toLowerCase();
            
            if (!highlights[message.author.id]) {
                highlights[message.author.id] = [];
            }

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
                    
                    if (highlights[message.author.id].length >= MAX_HIGHLIGHTS) {
                        return message.reply({ 
                            embeds: [createErrorEmbed(`You can only have up to ${MAX_HIGHLIGHTS} highlight words!`)] 
                        });
                    }
                    
                    if (!highlights[message.author.id].includes(word)) {
                        highlights[message.author.id].push(word);
                        saveHighlights(highlights);
                        
                        const successEmbed = new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setDescription(` Added "${word}" to your highlights`)
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
                    
                    const index = highlights[message.author.id].indexOf(wordToRemove);
                    if (index > -1) {
                        highlights[message.author.id].splice(index, 1);
                        saveHighlights(highlights);
                        
                        const successEmbed = new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setDescription(` Removed "${wordToRemove}" from your highlights`)
                            .setTimestamp();
                        message.reply({ embeds: [successEmbed] });
                    } else {
                        message.reply({ 
                            embeds: [createErrorEmbed('That word is not in your highlights!')] 
                        });
                    }
                    break;
                }

                case 'list': {
                    const userHighlights = highlights[message.author.id];
                    const listEmbed = new EmbedBuilder()
                        .setColor(0x0099FF)
                        .setTitle(` Highlights (${userHighlights.length}/${MAX_HIGHLIGHTS})`)
                        .setDescription(userHighlights.length > 0 ? userHighlights.join('\n') : 'No highlights set')
                        .setTimestamp();
                    
                    message.reply({ embeds: [listEmbed] });
                    break;
                }

                default: {
                    const helpEmbed = new EmbedBuilder()
                        .setColor(0x0099FF)
                        .setTitle('❓ Highlight Command Help')
                        .setDescription('Available Commands:')
                        .addFields(
                            { name: '`,hl add <word>`', value: 'Add a highlight word' },
                            { name: '`,hl remove <word>`', value: 'Remove a highlight word' },
                            { name: '`,hl list`', value: 'List your highlight words' }
                        )
                        .setFooter({ text: `Maximum ${MAX_HIGHLIGHTS} highlights per user` });
                    
                    message.reply({ embeds: [helpEmbed] });
                }
            }
            return;
        }

        // Handle other text commands
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
