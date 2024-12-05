// messageCreate.js
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { checkMessageForHighlights } = require('../text-commands/hl.js');

module.exports = {
    name: 'messageCreate',
    async execute(client, message) {
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
            await checkMessageForHighlights(client, message);
            return;
        }

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const fullCommand = args.shift().toLowerCase();
        const textCommand = client.textCommands.find(cmd => fullCommand.startsWith(cmd.name));

        if (fullCommand === 'resetsns') {
            if (!message.member.permissions.has('ADMINISTRATOR')) {
                return message.reply('You do not have permission to use this command.');
            }

            const donoLogsPath = path.join(__dirname, '../data/donoLogs.json');
            fs.writeFileSync(donoLogsPath, JSON.stringify({}, null, 2), 'utf8');
            return message.reply('Successfully reset the donation note tracking system!');
        }

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
