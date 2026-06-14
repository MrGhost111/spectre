// events/mcreate.js
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { checkMessageForHighlights } = require('../text-commands/hl.js');
const donationTracker = require('./donationTracker');
const { checkOneWordMessage, handleBlacklistCommand } = require('../utils/blacklistUtil');
const { validateStoryWords, generateAnonymousName } = require('../utils/storyUtils');
const { handleCountingMessage } = require('../utils/countingSystem');
const {
    handleFlowMessage,
    handleStickyMessage,
    GIVEAWAY_CHANNEL_ID,
    EVENT_CHANNEL_ID,
    SERVER_DONATION_CHANNEL_ID,
    DANK_MEMER_BOT_ID,
} = require('../Donations/donationFlow');
const { handleDankMessage } = require('../Donations/dankDetection');

require('dotenv').config();

let lastStickyMessageId = null;
const storyDataPath = path.join(__dirname, '../data/storyGame.json');

const COUNTING_CHANNEL_ID = '1473339737044553953';
const FLOW_CHANNEL_IDS = new Set([GIVEAWAY_CHANNEL_ID, EVENT_CHANNEL_ID, SERVER_DONATION_CHANNEL_ID]);

module.exports = {
    name: 'messageCreate',
    async execute(client, message) {
        console.log(`📨 Message received: Guild=${message.guild?.name || 'DM'}, Author=${message.author.tag}, Bot=${message.author.bot}, Content="${message.content.substring(0, 50)}"`);

        if (message.author.bot) {
            // ── Catch Dank Memer slash-command responses here ─────────────────
            // Slash-command Dank Memer messages arrive fully formed on messageCreate.
            // Text-command ones are caught on messageUpdate instead.
            // The shared dedup Set in dankDetection.js ensures no double-processing.
            if (message.author.id === DANK_MEMER_BOT_ID) {
                await handleDankMessage(client, message).catch(e =>
                    console.error('[MCREATE] handleDankMessage error:', e)
                );
            }

            // ── Sticky: repost when any bot sends in flow channels ─────────────
            if (message.guild && FLOW_CHANNEL_IDS.has(message.channelId)) {
                await handleStickyMessage(message.channel, message).catch(() => { });
            }
            return;
        }

        // ── Donation flow text responses ──────────────────────────────────────
        handleFlowMessage(message);

        // ── Sticky message for flow channels ─────────────────────────────────
        if (message.guild && FLOW_CHANNEL_IDS.has(message.channelId)) {
            await handleStickyMessage(message.channel, message).catch(() => { });
        }

        // ===========================================
        // STORY GAME DM HANDLER
        // ===========================================
        if (!message.guild) {
            if (fs.existsSync(storyDataPath)) {
                const storyData = JSON.parse(fs.readFileSync(storyDataPath, 'utf8'));

                if (storyData.active) {
                    if (storyData.votingActive) {
                        return message.reply('❌ Voting has already started! You can no longer submit or update your story.');
                    }

                    if (message.content.length < 50) {
                        return message.reply('❌ Your story is too short! Please write at least 50 characters.');
                    }

                    const validation = await validateStoryWords(message.content, storyData.words);

                    if (!validation.valid) {
                        return message.reply(`❌ Your story is missing the following words: **${validation.missingWords.join(', ')}**\n\nPlease include ALL 5 words: **${storyData.words.join(', ')}**\n\n💡 **Tip:** Send a new message with all the words included!`);
                    }

                    const isUpdate = storyData.submissions[message.author.id] !== undefined;
                    const anonymousName = isUpdate
                        ? storyData.submissions[message.author.id].anonymousName
                        : generateAnonymousName();

                    storyData.submissions[message.author.id] = {
                        story: message.content,
                        anonymousName: anonymousName,
                        timestamp: Date.now(),
                        messageId: message.id,
                    };
                    fs.writeFileSync(storyDataPath, JSON.stringify(storyData, null, 2), 'utf8');

                    const confirmEmbed = new EmbedBuilder()
                        .setColor(isUpdate ? '#FFA500' : '#00FF00')
                        .setTitle(isUpdate ? '✏️ Story Updated!' : '✅ Story Submitted Successfully!')
                        .setDescription(`Your story has been ${isUpdate ? 'updated' : 'submitted'} anonymously as **${anonymousName}**\n\n✨ **You can update your submission anytime before voting starts!**\nJust send a new message here with your updated story.\n\nWait for the moderators to finish the submission period and start voting!`)
                        .addFields(
                            { name: '📝 Your Story Preview', value: message.content.substring(0, 200) + (message.content.length > 200 ? '...' : '') },
                            { name: '🎯 Required Words', value: storyData.words.map(w => `**${w}**`).join(' • '), inline: false },
                        )
                        .setFooter({ text: isUpdate ? 'Your previous submission was replaced' : 'Good luck!' })
                        .setTimestamp();

                    return message.reply({ embeds: [confirmEmbed] });
                }
            }
            return;
        }

        // ===========================================
        // COUNTING GAME HANDLER
        // ===========================================
        if (message.channelId === COUNTING_CHANNEL_ID) {
            await handleCountingMessage(message, COUNTING_CHANNEL_ID);
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
                    setTimeout(async () => { try { await warningMsg.delete(); } catch (err) { console.error('Error deleting warning message:', err); } }, 5000);
                    return;
                }
            } catch (error) {
                console.error('Error checking one word story:', error);
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
            '720398363186692216',
        ];

        if (!message.author.bot &&
            message.guild?.id === '673970118744735764' &&
            message.channelId !== faceRevealChannelId &&
            message.channel.parentId &&
            !blacklistedCategories.includes(message.channel.parentId)) {

            const hasImage = message.attachments.some(a => a.contentType?.startsWith('image/')) ||
                /(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))/i.test(message.content);

            if (hasImage) {
                try {
                    const logChannel = await client.channels.fetch(logChannelId);
                    if (logChannel) {
                        const embed = new EmbedBuilder()
                            .setColor('#00ff00')
                            .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                            .setTimestamp()
                            .addFields(
                                { name: 'Author ID', value: message.author.id },
                                { name: 'Channel', value: `<#${message.channel.id}>` },
                                { name: 'Message Link', value: `[Jump to Message](${message.url})` },
                            );

                        const imageUrls = [];
                        message.attachments.forEach(a => { if (a.contentType?.startsWith('image/')) imageUrls.push(a.url); });
                        [...message.content.matchAll(/(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))/gi)].forEach(m => imageUrls.push(m[0]));

                        if (imageUrls.length > 0) {
                            embed.setImage(imageUrls[0]);
                            await logChannel.send({ embeds: [embed] });
                            for (let i = 1; i < imageUrls.length; i++) {
                                const additionalEmbed = new EmbedBuilder()
                                    .setColor('#00ff00')
                                    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
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

        if (message.content.startsWith('!muterole update') && message.guild) {
            if (!message.member.permissions.has('Administrator')) {
                return message.reply('❌ You do not have permission to use this command.');
            }

            const mutedRoleId = '673978861335085107';
            const CARL_BOT_ID = '235148962103951360';

            const protectedCategoryIds = new Set([
                '1064095644811284490',
                '842471433238347786',
                '799997847931977749',
            ]);

            const statusMsg = await message.channel.send('⏳ Waiting for Carl to finish updating...');

            try {
                const carlMessage = await message.channel.awaitMessages({
                    filter: m =>
                        m.author.id === CARL_BOT_ID &&
                        m.content.includes('The role') &&
                        m.content.includes('has been updated with'),
                    max: 1,
                    time: 30_000,
                    errors: ['time'],
                }).then(collected => collected.first());

                // React to Carl's message
                await carlMessage.react('🤓').catch(() => { });
                await carlMessage.react('👆').catch(() => { });

                await statusMsg.edit('⚙️ Carl finished. Scanning protected categories...');

                // Collect all channels in protected categories
                const channelsToRevert = [];
                for (const [, channel] of message.guild.channels.cache) {
                    if (channel.parentId && protectedCategoryIds.has(channel.parentId)) {
                        channelsToRevert.push(channel);
                    }
                }

                await statusMsg.edit(`🔄 Reverting mute role from **${channelsToRevert.length}** channels...`);

                let reverted = 0;
                let failed = 0;

                for (const channel of channelsToRevert) {
                    try {
                        await channel.permissionOverwrites.edit(mutedRoleId, {
                            SendMessages: null,
                            ViewChannel: null,
                        });
                        reverted++;

                        // Live counter update every 5 channels
                        if (reverted % 5 === 0) {
                            await statusMsg.edit(`🔄 Reverting... **${reverted}/${channelsToRevert.length}** channels done`);
                        }
                    } catch (err) {
                        console.error(`Failed to revert channel ${channel.id}:`, err);
                        failed++;
                    }
                }

                const summary = [
                    `✅ Done! Reverted mute role overrides in **${reverted}** channel${reverted !== 1 ? 's' : ''}`,
                    failed > 0 ? `⚠️ Failed to revert **${failed}** channel${failed !== 1 ? 's' : ''}` : null,
                    `🛡️ Protected categories: **${protectedCategoryIds.size}** | Channels scanned: **${channelsToRevert.length}**`,
                ].filter(Boolean).join('\n');

                await statusMsg.edit(summary);

            } catch (err) {
                if (err.message === 'time' || (err.size !== undefined && err.size === 0)) {
                    await statusMsg.edit('❌ Timed out waiting for Carl\'s response. Did you run the Carl command?');
                } else {
                    console.error('Error in muterole update:', err);
                    await statusMsg.edit('❌ Something went wrong while reverting. Check console for details.');
                }
            }

            return;
        }

        const prefix = ',';

        if (!message.content.startsWith(prefix)) {
            if (!message.guild) return;
            try {
                if (!message.author.bot) await checkMessageForHighlights(client, message);
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

        try {
            await command.execute(message, args);
        } catch (error) {
            console.error(`Error executing command ${commandName}:`, error);
            await message.reply('There was an error trying to execute that command!').catch(console.error);
        }
    },
};