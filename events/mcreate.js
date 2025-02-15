const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { checkMessageForHighlights } = require('../text-commands/hl.js');

let lastStickyMessageId = null;

module.exports = {
    name: 'messageCreate',
    async execute(client, message) {
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

        // Updated reaction code for both channels
        if (message.channelId === '1299069910751903857' || message.channelId === '942669844975861820') {
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

        if (!command) {
            if (commandName === 'valentine') {
                try {
                    const targetChannelId = '942669844975861820';
                    const startMessageId = '1337812573017342094';
                    let allMessages = [];

                    const fetchingMsg = await message.channel.send('Fetching and analyzing messages... This might take a moment.');

                    const channel = await client.channels.fetch(targetChannelId);
                    if (!channel) return;

                    let lastId = null;
                    while (true) {
                        const options = { limit: 100 };
                        if (lastId) {
                            options.before = lastId;
                        }

                        const messages = await channel.messages.fetch(options);
                        if (messages.size === 0) break;

                        const filteredMessages = messages.filter(msg => 
                            msg.id > startMessageId && !msg.author.bot);

                        for (const msg of filteredMessages.values()) {
                            const upvoteReaction = msg.reactions.cache.get('1303963379945181224');
                            const downvoteReaction = msg.reactions.cache.get('1303963004915679232');

                            const upvotes = upvoteReaction ? (await upvoteReaction.users.fetch()).filter(user => !user.bot).size : 0;
                            const downvotes = downvoteReaction ? (await downvoteReaction.users.fetch()).filter(user => !user.bot).size : 0;

                            allMessages.push({
                                messageId: msg.id,
                                content: msg.content,
                                author: msg.author,
                                score: upvotes - downvotes,
                                upvotes,
                                downvotes,
                                url: msg.url
                            });
                        }

                        lastId = messages.last().id;

                        if (messages.last().id <= startMessageId) break;
                    }

                    // Sort messages by score
                    allMessages.sort((a, b) => b.score - a.score);

                    // Create embed with new format
                    const guild = message.guild;
                    const embed = new EmbedBuilder()
                        .setTitle('Top Voted Advertisements')
                        .setThumbnail(guild.iconURL({ dynamic: true }))
                        .setColor('#00ff00')
                        .setFooter({ 
                            text: guild.name, 
                            iconURL: guild.iconURL({ dynamic: true }) 
                        });

                    const top3 = allMessages.slice(0, 3);
                    const numbers = ['<a:one_:1311073131905024040>', '<a:two_:1311075222312718346>', '<a:three_:1311075241283424380>'];
                    
                    let description = '';
                    for (let i = 0; i < top3.length; i++) {
                        const msg = top3[i];
                        description += `${numbers[i]} [${msg.author.username}](${msg.url}) <:upvote:1303963379945181224>${msg.upvotes} <:downvote:1303963004915679232>${msg.downvotes}\n`;
                    }

                    embed.setDescription(description);
                    await message.channel.send({ embeds: [embed] });
                    await fetchingMsg.delete();

                } catch (error) {
                    console.error('Error in valentine command:', error);
                    await message.channel.send('An error occurred while fetching top voted messages.');
                }
                return;
            }
            return;
        }

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
