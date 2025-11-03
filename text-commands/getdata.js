// JavaScript source code
const { EmbedBuilder, Colors } = require('discord.js');
const dataManager = require('../utils/dataManager');

module.exports = {
    name: 'getdata',
    aliases: ['fetchdata', 'showdata', 'querydata', 'checkdata'],
    description: 'Query database information',
    async execute(message, args, entities = null) {
        // Only allow admins or specific users
        if (!message.member.permissions.has('Administrator') && message.author.id !== '753491023208120321') {
            return message.reply('❌ You do not have permission to query database information.');
        }

        let targetUser = null;
        let dataType = null;
        let searchQuery = null;

        // Detect what data they're asking about
        const content = message.content.toLowerCase();

        // Detect data type from keywords
        if (content.includes('allow') || content.includes('whitelist')) {
            dataType = 'allow';
        } else if (content.includes('channel') || content.includes('vc') || content.includes('friend')) {
            dataType = 'channels';
        } else if (content.includes('highlight') || content.includes('hl')) {
            dataType = 'highlights';
        } else if (content.includes('streak')) {
            dataType = 'streaks';
        } else if (content.includes('stat')) {
            dataType = 'stats';
        } else if (content.includes('cooldown') || content.includes('cd')) {
            dataType = 'cooldowns';
        }

        // Extract user from entities or mentions
        if (entities && entities.users && entities.users.length > 0) {
            targetUser = entities.users[0];
        } else {
            targetUser = message.mentions.users.first();
        }

        // Parse args for user ID or search query
        if (!targetUser && args.length > 0) {
            const skipWords = ['who', 'what', 'when', 'where', 'data', 'info', 'get', 'fetch', 'show', 'check', 'allowed', 'has', 'about'];
            const filteredArgs = args.filter(arg => !skipWords.includes(arg.toLowerCase()));

            for (const arg of filteredArgs) {
                // Try as user ID
                if (/^\d{17,19}$/.test(arg)) {
                    try {
                        const user = await message.client.users.fetch(arg);
                        if (user) {
                            targetUser = user;
                            break;
                        }
                    } catch (error) {
                        // Not a user ID, might be search query
                    }
                }
            }

            // If no user found, treat as search query
            if (!targetUser && filteredArgs.length > 0) {
                searchQuery = filteredArgs.join(' ');
            }
        }

        try {
            // If no specific data type, show all data for user
            if (!dataType && targetUser) {
                const embed = new EmbedBuilder()
                    .setColor(Colors.Blue)
                    .setTitle(`📊 Data for ${targetUser.username}`)
                    .setThumbnail(targetUser.displayAvatarURL());

                // Check allow data
                const allowData = await dataManager.getAllowData(targetUser.id);
                if (allowData) {
                    embed.addFields({
                        name: '✅ Whitelist Status',
                        value: `Allowed at: ${allowData.allowedAt}\nAllowed by: <@${allowData.allowedBy}>`,
                        inline: false
                    });
                }

                // Check channel data
                const channelData = await dataManager.getChannelData(targetUser.id);
                if (channelData) {
                    const friendsList = channelData.friends && channelData.friends.length > 0
                        ? channelData.friends.map(id => `<@${id}>`).join(', ')
                        : 'None';
                    embed.addFields({
                        name: '🎤 Channel Data',
                        value: `Channel: <#${channelData.channelId}>\nFriends: ${friendsList}`,
                        inline: false
                    });
                }

                // Check highlights
                const highlightData = await dataManager.getHighlightData(targetUser.id);
                if (highlightData) {
                    const words = highlightData.words && highlightData.words.length > 0
                        ? highlightData.words.join(', ')
                        : 'None';
                    embed.addFields({
                        name: '🔔 Highlights',
                        value: `Words: ${words}`,
                        inline: false
                    });
                }

                if (embed.data.fields && embed.data.fields.length > 0) {
                    return message.reply({ embeds: [embed] });
                } else {
                    return message.reply(`No data found for ${targetUser.username}.`);
                }
            }

            // If specific data type requested
            if (dataType) {
                if (dataType === 'allow') {
                    const data = await dataManager.getAllowData(targetUser ? targetUser.id : null);

                    if (targetUser && data) {
                        const embed = new EmbedBuilder()
                            .setColor(Colors.Green)
                            .setTitle('✅ Whitelist Data')
                            .addFields(
                                { name: 'User', value: `<@${targetUser.id}>`, inline: true },
                                { name: 'Allowed At', value: data.allowedAt, inline: true },
                                { name: 'Allowed By', value: `<@${data.allowedBy}>`, inline: true }
                            );
                        return message.reply({ embeds: [embed] });
                    } else if (!targetUser) {
                        const count = Object.keys(data).length;
                        return message.reply(`There are **${count}** whitelisted users in the database.`);
                    } else {
                        return message.reply(`${targetUser.username} is not whitelisted.`);
                    }
                }

                if (dataType === 'channels') {
                    const data = await dataManager.getChannelData(targetUser ? targetUser.id : null);

                    if (targetUser && data) {
                        const friendsList = data.friends && data.friends.length > 0
                            ? data.friends.map(id => `<@${id}>`).join(', ')
                            : 'None';

                        const embed = new EmbedBuilder()
                            .setColor(Colors.Blue)
                            .setTitle('🎤 Channel Data')
                            .addFields(
                                { name: 'Owner', value: `<@${data.userId}>`, inline: true },
                                { name: 'Channel', value: `<#${data.channelId}>`, inline: true },
                                { name: 'Created At', value: new Date(data.createdAt).toLocaleString(), inline: false },
                                { name: `Friends (${data.friends ? data.friends.length : 0})`, value: friendsList, inline: false }
                            );
                        return message.reply({ embeds: [embed] });
                    } else if (!targetUser) {
                        const count = Object.keys(data).length;
                        return message.reply(`There are **${count}** donor channels in the database.`);
                    } else {
                        return message.reply(`${targetUser.username} doesn't have a donor channel.`);
                    }
                }

                if (dataType === 'highlights') {
                    const data = await dataManager.getHighlightData(targetUser ? targetUser.id : null);

                    if (targetUser && data) {
                        const words = data.words && data.words.length > 0 ? data.words.join(', ') : 'None';
                        const blacklistedWords = data.blacklist?.words && data.blacklist.words.length > 0
                            ? data.blacklist.words.join(', ')
                            : 'None';
                        const blacklistedUsers = data.blacklist?.users && data.blacklist.users.length > 0
                            ? data.blacklist.users.map(id => `<@${id}>`).join(', ')
                            : 'None';
                        const blacklistedChannels = data.blacklist?.channels && data.blacklist.channels.length > 0
                            ? data.blacklist.channels.map(id => `<#${id}>`).join(', ')
                            : 'None';

                        const embed = new EmbedBuilder()
                            .setColor(Colors.Gold)
                            .setTitle('🔔 Highlight Data')
                            .addFields(
                                { name: 'User', value: `<@${targetUser.id}>`, inline: false },
                                { name: 'Highlight Words', value: words, inline: false },
                                { name: 'Blacklisted Words', value: blacklistedWords, inline: false },
                                { name: 'Blacklisted Users', value: blacklistedUsers, inline: false },
                                { name: 'Blacklisted Channels', value: blacklistedChannels, inline: false }
                            );
                        return message.reply({ embeds: [embed] });
                    } else if (!targetUser) {
                        const count = Object.keys(data).length;
                        return message.reply(`There are **${count}** users with highlights in the database.`);
                    } else {
                        return message.reply(`${targetUser.username} doesn't have any highlights set.`);
                    }
                }
            }

            // If search query provided
            if (searchQuery) {
                await message.channel.sendTyping();
                const results = await dataManager.searchData(searchQuery);

                if (Object.keys(results).length === 0) {
                    return message.reply(`No results found for query: **${searchQuery}**`);
                }

                const embed = new EmbedBuilder()
                    .setColor(Colors.Purple)
                    .setTitle('🔍 Search Results')
                    .setDescription(`Query: \`${searchQuery}\``);

                for (const [fileKey, matches] of Object.entries(results)) {
                    if (matches.length > 0) {
                        const matchText = matches.slice(0, 5).map(m =>
                            `\`${m.path}\`: ${JSON.stringify(m.value).substring(0, 50)}...`
                        ).join('\n');

                        embed.addFields({
                            name: `📁 ${fileKey} (${matches.length} matches)`,
                            value: matchText || 'No matches',
                            inline: false
                        });
                    }
                }

                return message.reply({ embeds: [embed] });
            }

            // Default response if nothing specific
            return message.reply('Please specify what data you want to query. Examples:\n' +
                '- `spectre get data about @user`\n' +
                '- `spectre show allow data for 123456789`\n' +
                '- `spectre check channel info for john`\n' +
                '- `spectre who allowed this user`');

        } catch (error) {
            console.error('Error querying data:', error);
            return message.reply('❌ There was an error querying the database. Please try again.');
        }
    },
};