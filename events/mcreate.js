const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { checkMessageForHighlights } = require('../text-commands/hl.js');

let lastStickyMessageId = null;

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
                
                // Check if message contains more than one word
                const messageContent = message.content.trim();
                const wordCount = messageContent.split(/\s+/).length;
                
                if (wordCount > 1) {
                    await message.delete();
                    const warningMsg = await message.channel.send(
                        `<@${message.author.id}> Only one word is allowed in this channel!`
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
                
                // Enhanced blacklist check - check if any blacklisted word is contained within the message
                const wordLower = messageContent.toLowerCase();
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
};
