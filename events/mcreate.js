const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { checkMessageForHighlights } = require('../text-commands/hl.js');
const donationTracker = require('./donationTracker');
const { checkOneWordMessage, handleBlacklistCommand } = require('../utils/blacklistUtil');
const { validateStoryWords, generateAnonymousName } = require('../utils/storyUtils');
const { handleCountingMessage } = require('../utils/countingSystem');

require('dotenv').config();

let lastStickyMessageId = null;
const storyDataPath = path.join(__dirname, '../data/storyGame.json');

// ── Set your counting channel ID here ────────────────────────────────────────
const COUNTING_CHANNEL_ID = '1473339737044553953';
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    name: 'messageCreate',
    async execute(client, message) {
        // Debug logging
        console.log(`📨 Message received: Guild=${message.guild?.name || 'DM'}, Author=${message.author.tag}, Bot=${message.author.bot}, Content="${message.content.substring(0, 50)}"`);

        // Ignore all bot messages except for specific features
        if (message.author.bot) {
            // Track donation messages from Dank Memer bot
            await donationTracker.execute(client, message);
            return;
        }

        // ===========================================
        // STORY GAME DM HANDLER
        // ===========================================
        if (!message.guild) {
            // This is a DM - check if story game is active
            if (fs.existsSync(storyDataPath)) {
                const storyData = JSON.parse(fs.readFileSync(storyDataPath, 'utf8'));

                if (storyData.active) {
                    // Check if voting has already started
                    if (storyData.votingActive) {
                        return message.reply('❌ Voting has already started! You can no longer submit or update your story.');
                    }

                    // Validate story length (minimum 50 characters)
                    if (message.content.length < 50) {
                        return message.reply('❌ Your story is too short! Please write at least 50 characters.');
                    }

                    // Validate that story contains all required words using AI
                    const validation = await validateStoryWords(message.content, storyData.words);

                    if (!validation.valid) {
                        return message.reply(`❌ Your story is missing the following words: **${validation.missingWords.join(', ')}**\n\nPlease include ALL 5 words: **${storyData.words.join(', ')}**\n\n💡 **Tip:** Send a new message with all the words included!`);
                    }

                    // Check if this is an update or new submission
                    const isUpdate = storyData.submissions[message.author.id] !== undefined;

                    // Use existing anonymous name or generate new one
                    const anonymousName = isUpdate
                        ? storyData.submissions[message.author.id].anonymousName
                        : generateAnonymousName();

                    // Save/update submission
                    storyData.submissions[message.author.id] = {
                        story: message.content,
                        anonymousName: anonymousName,
                        timestamp: Date.now(),
                        messageId: message.id
                    };
                    fs.writeFileSync(storyDataPath, JSON.stringify(storyData, null, 2), 'utf8');

                    // Confirm submission
                    const confirmEmbed = new EmbedBuilder()
                        .setColor(isUpdate ? '#FFA500' : '#00FF00')
                        .setTitle(isUpdate ? '✏️ Story Updated!' : '✅ Story Submitted Successfully!')
                        .setDescription(`Your story has been ${isUpdate ? 'updated' : 'submitted'} anonymously as **${anonymousName}**\n\n✨ **You can update your submission anytime before voting starts!**\nJust send a new message here with your updated story.\n\nWait for the moderators to finish the submission period and start voting!`)
                        .addFields(
                            { name: '📝 Your Story Preview', value: message.content.substring(0, 200) + (message.content.length > 200 ? '...' : '') },
                            { name: '🎯 Required Words', value: storyData.words.map(w => `**${w}**`).join(' • '), inline: false }
                        )
                        .setFooter({ text: isUpdate ? 'Your previous submission was replaced' : 'Good luck!' })
                        .setTimestamp();

                    return message.reply({ embeds: [confirmEmbed] });
                }
            }

            // No active story game - ignore DM
            return;
        }

        // ===========================================
        // COUNTING GAME HANDLER
        // ===========================================
        if (message.channelId === COUNTING_CHANNEL_ID) {
            await handleCountingMessage(message, COUNTING_CHANNEL_ID);
            // Don't return — highlights and other passive features can still run below
        }

        // ===========================================
        // SPECTRE AI HANDLER (before other checks)
        // ===========================================
        // Check if message starts with "spectre" or "@Spectre"
        const spectreKeywords = ['spectre', '@spectre'];
        const lowerContent = message.content.toLowerCase();

        if (spectreKeywords.some(keyword => lowerContent.startsWith(keyword))) {
            // Extract the actual command (remove "spectre " or "@spectre ")
            let userMessage = message.content;
            for (const keyword of spectreKeywords) {
                if (lowerContent.startsWith(keyword)) {
                    userMessage = message.content.substring(keyword.length).trim();
                    break;
                }
            }

            if (userMessage.length === 0) {
                // Just "spectre" without command - ignore silently
                return;
            }

            // Process with SpectreAI
            const result = await spectreAI.process(message, userMessage);

            // If no permission, silently return (no response)
            if (result.type === 'no_permission') {
                return;
            }

            // If error, send error embed
            if (result.type === 'error') {
                await message.reply({ embeds: [result.embed] });
            }

            // For confirmation_created, SpectreAI already sent the confirmation
            return;
        }

        // ===========================================
        // REST OF EXISTING CODE
        // ===========================================

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
            message.guild?.id === '673970118744735764' &&
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

        // Mute role update command
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

        // Regular commands with , prefix
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

