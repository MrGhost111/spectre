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
                        const previousValue = client.itemPrices.get(itemName);
                        if (previousValue !== undefined && previousValue !== averageValue) {
                            client.itemPrices.set(itemName, averageValue);
                            message.channel.send(`Updated item **${itemName}**'s price to **${averageValue}** coins.`);
                        } else {
                            client.itemPrices.set(itemName, averageValue);
                            message.channel.send(`Added item **${itemName}** with price **${averageValue}** coins.`);
                        }
                        client.saveItems();
                    }
                }
            }
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
