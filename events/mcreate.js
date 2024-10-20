const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'messageCreate',
    async execute(client, message) {
        if (message.author.bot) {
            // Handle Dank Memer bot item price detection
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

            // Send initial message
            await message.channel.send('Waiting for Carl...');

            // Defer the action by 5 seconds
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
                    await message.channel.send('Fixed Carl’s skill issue by reverting changes made to event channels.');
                } catch (error) {
                    console.error('Error updating permissions:', error);
                    await message.channel.send('There was an error updating permissions. Please try again.');
                }
            }, 5000);
            return;
        }

        const prefix = ',';
        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const fullCommand = args.shift().toLowerCase();
        const textCommand = client.textCommands.find(cmd => fullCommand.startsWith(cmd.name));

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
