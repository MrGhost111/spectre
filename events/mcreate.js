const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { checkMessageForHighlights } = require('../text-commands/hl.js');
const donationTracker = require('./donationTracker');
const { checkOneWordMessage, handleBlacklistCommand } = require('../utils/blacklistUtil');
const axios = require('axios');
require('dotenv').config();

let lastStickyMessageId = null;
const chatHistories = new Map();

module.exports = {
    name: 'messageCreate',
    async execute(client, message) {
        if (message.author.bot) return;

        if (!message.guild) {
            try {
                await message.channel.sendTyping();
                
                if (!chatHistories.has(message.author.id)) {
                    chatHistories.set(message.author.id, []);
                }
                const history = chatHistories.get(message.author.id);

                const messages = [
                    {
                        role: "system",
                        content: "You are a helpful AI assistant. Keep responses concise and friendly."
                    },
                    ...history.slice(-4),
                    {
                        role: "user",
                        content: message.content
                    }
                ];

                const response = await axios.post(
                    'https://api.openai.com/v1/chat/completions',
                    {
                        model: "gpt-3.5-turbo",
                        messages: messages,
                        max_tokens: 500,
                        temperature: 0.7
                    },
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                        },
                        timeout: 10000
                    }
                );

                const aiResponse = response.data.choices[0].message.content;
                
                history.push(
                    { role: "user", content: message.content },
                    { role: "assistant", content: aiResponse }
                );
                
                if (history.length > 10) {
                    chatHistories.set(message.author.id, history.slice(-10));
                }
                
                return message.reply(aiResponse);
            } catch (error) {
                console.error('AI Error:', error);
                return message.reply("I'm having trouble responding. Please try again later.");
            }
        }

        if (message.channelId === '1346427004299378718') {
            try {
                const result = await checkOneWordMessage(message);
                if (!result.isValid) {
                    await message.delete();
                    const warningMsg = await message.channel.send(result.message);
                    setTimeout(async () => {
                        try { await warningMsg.delete(); } 
                        catch (err) { console.error('Error deleting warning:', err); }
                    }, 5000);
                    return;
                }
            } catch (error) {
                console.error('One Word Story Error:', error);
            }
        }

        const blacklistCommandHandled = await handleBlacklistCommand(message);
        if (blacklistCommandHandled) return;

        if (message.channelId === '673970943244369930' && message.author.id !== client.user.id) {
            try {
                if (lastStickyMessageId) {
                    try {
                        const oldMessage = await message.channel.messages.fetch(lastStickyMessageId);
                        if (oldMessage) await oldMessage.delete();
                    } catch (error) {
                        console.error('Sticky Message Delete Error:', error);
                    }
                }

                const stickyMessage = await message.channel.send(
                    "Annoyed by these pings? get no partnership ping from https://discord.com/channels/673970118744735764/1317992115917295647/1321411901330165770"
                );
                lastStickyMessageId = stickyMessage.id;
            } catch (error) {
                console.error('Sticky Message Error:', error);
            }
        }

        await donationTracker.execute(client, message);

        if (message.channelId === '1299069910751903857') {
            try {
                await message.react('<:upvote:1303963379945181224>');
                await message.react('<:downvote:1303963004915679232>');
            } catch (error) {
                console.error('Reaction Error:', error);
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

        if (message.channelId !== faceRevealChannelId &&
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
                    console.error('Image Log Error:', error);
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
                        }
                    }
                    await message.channel.send('Fixed Carls skill issue by reverting changes made to event channels.');
                } catch (error) {
                    console.error('Mute Role Error:', error);
                    await message.channel.send('Error updating permissions. Please try again.');
                }
            }, 5000);
            return;
        }

        const prefix = ',';

        if (!message.content.startsWith(prefix)) {
            try {
                await checkMessageForHighlights(client, message);
            } catch (error) {
                console.error('Highlight Error:', error);
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
            console.error(`Command Error (${commandName}):`, error);
            await message.reply('There was an error executing that command!');
        }
    }
};
