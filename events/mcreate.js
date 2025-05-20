// events/messageCreate.js
const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ChannelType } = require('discord.js'); // Import ChannelType for DM checks [3]
const OpenAI = require('openai').default; // Import OpenAI for API interaction [2]
const { checkMessageForHighlights } = require('../text-commands/hl.js');
const donationTracker = require('./donationTracker');
const { checkOneWordMessage, handleBlacklistCommand } = require('../utils/blacklistUtil');

let lastStickyMessageId = null;

module.exports = {
    name: 'messageCreate',
    async execute(client, message) {
        // Handle DM messages by sending to OpenAI
        if (message.channel.type === ChannelType.DM &&!message.author.bot) { // Check if it's a DM and not from a bot [3]
            console.log(`DM RECEIVED from ${message.author.tag}: "${message.content}"`);

            try {
                // Indicate that the bot is typing for better user experience
                await message.channel.sendTyping();

                // Ensure OpenAI client is initialized and available on the client object
                if (!client.openai) {
                    await message.author.send('The AI service is not initialized. Please try again later.');
                    console.error('OpenAI client not initialized when receiving DM.');
                    return;
                }

                // Send the user's message to OpenAI for chat completion
                const completion = await client.openai.chat.completions.create({ // Use client.openai instance [4, 2]
                    model: 'gpt-4o', // Specify the AI model to use (e.g., 'gpt-4o' or 'gpt-3.5-turbo') [4]
                    messages:,
                    // Optional: Enable streaming for faster perceived responses (uncomment if desired)
                    // stream: true, // [4]
                });

                let aiResponseContent = '';

                // If streaming is NOT enabled (default behavior):
                aiResponseContent = completion.choices.message.content; // Extract the AI's response content [4]

                // Send the AI's response back to the user via DM
                await message.author.send(aiResponseContent); // Send DM to the message author [5, 6]
                console.log(`Sent AI response to ${message.author.tag}`);

            } catch (error) {
                console.error('Error interacting with OpenAI API:');
                if (error instanceof OpenAI.APIError) { // Handle specific OpenAI API errors [4]
                    console.error(`Status: ${error.status}`);
                    console.error(`Name: ${error.name}`);
                    console.error(`Request ID: ${error.request_id}`); // Log request ID for debugging with OpenAI [4]
                    console.error(`Headers: ${JSON.stringify(error.headers)}`);
                    await message.author.send('An error occurred while processing your request with OpenAI. Please try again later.');
                } else {
                    console.error(error);
                    await message.author.send('An unexpected error occurred. Please try again later.');
                }
            }
            return; // Stop further processing for DMs after handling
        }

        // One Word Story moderation
        if (message.channelId === '1346427004299378718' &&!message.author.bot) {
            try {
                const result = await checkOneWordMessage(message);
                if (!result.isValid) {
                    await message.delete();
                    const warningMsg = await message.channel.send(result.message);

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

        // Check for blacklist management command
        const blacklistCommandHandled = await handleBlacklistCommand(message);
        if (blacklistCommandHandled) return;

        if (message.channelId === '673970943244369930' && message.author.id!== client.user.id) {
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
        const DANK_MEMER_BOT_ID = '270904126974590976';
        const TRANSACTION_CHANNEL_ID = '833246120389902356';

        // Forward to donation tracker
        await donationTracker.execute(client, message);

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
            message.channelId!== faceRevealChannelId &&
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

                        const imageUrls =;
                        message.attachments.forEach(attachment => {
                            if (attachment.contentType?.startsWith('image/')) {
                                imageUrls.push(attachment.url);
                            }
                        });

                        const imageMatches = [...message.content.matchAll(/(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))/gi)];
                        imageMatches.forEach(match => imageUrls.push(match));

                        if (imageUrls.length > 0) {
                            embed.setImage(imageUrls);
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

        // Mute role update command - Fixed with proper function declaration
        if (message.content.startsWith('!muterole update') && message.guild) {
            const eventChannelIds = [
                '1296077996435832902',
                '815478998283976704',
                '850431178170433556',
                '944923216982470656',
                '710788619719409695',
                '944924520647643156'
            ];

            const mutedRoleId = '673978861335085107';

            try {
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
            } catch (error) {
                console.error('Error in muterole update command:', error);
            }
        }

        const prefix = ',';

        if (!message.content.startsWith(prefix)) {
            if (!message.guild) return;
            try {
                // Skip highlight checking if the message author is a bot
                if (!message.author.bot) {
                    await checkMessageForHighlights(client, message);
                }
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
