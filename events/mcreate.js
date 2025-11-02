const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { checkMessageForHighlights } = require('../text-commands/hl.js');
const donationTracker = require('./donationTracker');
const { checkOneWordMessage, handleBlacklistCommand } = require('../utils/blacklistUtil');
const huggingFaceApi = require('../utils/huggingFaceApi');
const { HfInference } = require('@huggingface/inference');
require('dotenv').config();

let lastStickyMessageId = null;

// AI Command Parser using Hugging Face Inference Providers (Correct Method)
async function parseCommandWithAI(userMessage) {
    const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;

    if (!HF_API_KEY) {
        throw new Error('HUGGINGFACE_API_KEY not found in .env file');
    }

    try {
        // Using the official Hugging Face Inference SDK
        const hf = new HfInference(HF_API_KEY);

        const response = await hf.chatCompletion({
            model: "Qwen/Qwen2.5-Coder-32B-Instruct",
            messages: [
                {
                    role: "system",
                    content: "You are a command parser. Respond ONLY with valid JSON, no other text."
                },
                {
                    role: "user",
                    content: `Parse this message and respond with JSON in this format: {"understood": true, "intent": "what user wants", "confidence": "high/medium/low"}

Message: "${userMessage}"`
                }
            ],
            max_tokens: 150,
            temperature: 0.3
        });

        console.log('Hugging Face Response:', response);

        // Extract the AI's response
        const aiResponse = response.choices[0].message.content;

        // Try to parse JSON from response
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        // Fallback
        return {
            understood: true,
            intent: aiResponse || 'Processing your request',
            confidence: 'medium'
        };

    } catch (error) {
        console.error('AI Parsing Error:', error);
        throw error;
    }
}

module.exports = {
    name: 'messageCreate',
    async execute(client, message) {
        // TEST: AI Command Parser (triggered by "spectre" prefix)
        if (message.content.toLowerCase().startsWith('spectre ') && !message.author.bot) {
            const userCommand = message.content.slice(8).trim(); // Remove "spectre " prefix

            try {
                await message.channel.sendTyping();

                const parsedResult = await parseCommandWithAI(userCommand);

                const confidenceEmoji = {
                    'high': '🟢',
                    'medium': '🟡',
                    'low': '🔴'
                };

                const embed = new EmbedBuilder()
                    .setColor('#FFD21E')
                    .setTitle('🤖 AI Command Parser Test')
                    .addFields(
                        { name: 'Your Message', value: `\`${userCommand}\`` },
                        { name: 'AI Understanding', value: parsedResult.intent || 'No response' },
                        {
                            name: 'Status',
                            value: `${parsedResult.understood ? '✅ Understood' : '❌ Not Understood'} ${confidenceEmoji[parsedResult.confidence] || ''} ${parsedResult.confidence || ''}`
                        }
                    )
                    .setFooter({ text: 'Powered by Hugging Face Inference Providers' })
                    .setTimestamp();

                await message.reply({ embeds: [embed] });

            } catch (error) {
                console.error('AI Test Error:', error);

                let errorMessage = error.message;
                let troubleshooting = '**Troubleshooting:**\n';

                if (error.message.includes('503')) {
                    errorMessage = 'Model is loading... Try again in 20-30 seconds!';
                    troubleshooting += '- Wait 20-30 seconds for the model to load\n- First request after idle time takes longer';
                } else if (error.message.includes('401') || error.message.includes('403')) {
                    errorMessage = 'Invalid API Key! Check your HUGGINGFACE_API_KEY in .env file';
                    troubleshooting += '- Make sure HUGGINGFACE_API_KEY is set correctly\n- Get your key from: https://huggingface.co/settings/tokens\n- Make sure "Make calls to Inference Providers" is enabled';
                } else if (error.message.includes('429')) {
                    errorMessage = 'Rate limit exceeded. Try again in a few minutes.';
                    troubleshooting += '- Free tier: limited requests per hour\n- Wait a few minutes and try again\n- PRO tier ($9/month) has higher limits';
                } else if (error.message.includes('Cannot find module')) {
                    errorMessage = 'Missing @huggingface/inference package!';
                    troubleshooting += '- Run: npm install @huggingface/inference\n- Then restart your bot';
                } else {
                    troubleshooting += '- Check your HUGGINGFACE_API_KEY in .env file\n- Verify internet connection\n- Try again in a few seconds\n- Make sure you have: npm install @huggingface/inference';
                }

                await message.reply(`❌ **AI Test Failed**\n\`\`\`${errorMessage}\`\`\`\n\n${troubleshooting}`);
            }

            return; // Stop here for testing
        }

        // Handle DM messages (use Hugging Face API instead of echo)
        if (!message.guild && !message.author.bot) {
            console.log(`DM RECEIVED from ${message.author.tag}: "${message.content}"`);

            try {
                // Let the user know the bot is "thinking"
                await message.channel.sendTyping();

                // Check for reset command
                if (message.content.toLowerCase() === '!reset') {
                    const reset = huggingFaceApi.resetConversation(message.author.id);
                    if (reset) {
                        await message.author.send("I've reset our conversation. What would you like to talk about?");
                    } else {
                        await message.author.send("There was no conversation history to reset.");
                    }
                    return;
                }

                // Get response from Hugging Face
                const chatbotResponse = await huggingFaceApi.getChatbotResponse(message.author.id, message.content);

                // Send the response
                await message.author.send(chatbotResponse);
                console.log(`Successfully sent chatbot response to ${message.author.tag}`);
            } catch (error) {
                console.error(`Failed to send DM response: ${error.message}`);
                try {
                    await message.author.send("Sorry, I encountered an error while processing your message.");
                } catch (dmError) {
                    console.error(`Failed to send error message: ${dmError.message}`);
                }
            }
            return;
        }

        // One Word Story moderation
        if (message.channelId === '1346427004299378718' && !message.author.bot) {
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