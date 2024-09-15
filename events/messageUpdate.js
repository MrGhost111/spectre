const { Events } = require('discord.js');

module.exports = {
    name: Events.MessageUpdate,
    execute(client, oldMessage, newMessage) {
        // Check if the message was updated by a bot and if it has an embed
        if (newMessage.author.bot && newMessage.author.id === '270904126974590976' && newMessage.embeds.length > 0) {
            // Handle item donations
            const embed = newMessage.embeds[0];
            const description = embed.description || '';

            if (description.includes('Successfully donated') && !description.includes('⏣')) {
                console.log('Detected an item donation:', description);
                const amountMatch = description.match(/\*\*(\d+)\s<[^>]+>/);
                const itemNameMatch = description.match(/<[^>]+>\s([^*]+)\*\*/);

                if (amountMatch && itemNameMatch) {
                    const amount = parseInt(amountMatch[1], 10);
                    const itemName = itemNameMatch[1].trim();
                    const itemPrice = client.itemPrices.get(itemName);

                    if (itemPrice) {
                        const totalValue = amount * itemPrice;
                        const repliedUser = newMessage.interaction?.user || newMessage.author;
                        if (repliedUser) {
                            setDonationNote(repliedUser.id, `${totalValue} (${amount}x ${itemName})`);
                            newMessage.react('✅');
                            newMessage.channel.send({
                                embeds: [{
                                    title: 'Donation Note Set',
                                    description: `Set note for **${repliedUser.tag}**\nItem: **${amount}x ${itemName}**\nTotal: **${totalValue} coins**\nTotal Donations: **${client.donations.get(repliedUser.id) || 0} coins**`,
                                    color: 0x1abc9c
                                }]
                            });
                        }
                    } else {
                        newMessage.channel.send({
                            embeds: [{
                                title: 'Item Not Found',
                                description: `Item **${itemName}** not found. Please run the Dank Memer command **/item ${itemName}** to add it to the database.`,
                                color: 0x1abc9c
                            }]
                        });
                        newMessage.channel.send('Ignore this setnote. It\'s just a test.');
                    }
                }
            } else if (description.includes('Successfully donated') && description.includes('⏣')) {
                console.log('Detected a coin donation:', description);
                const coinAmountMatch = description.match(/⏣\s*([\d,]+)/);
                if (coinAmountMatch) {
                    const coinAmount = parseInt(coinAmountMatch[1].replace(/,/g, ''), 10);
                    const repliedUser = newMessage.interaction?.user || newMessage.author;
                    if (repliedUser) {
                        setDonationNote(repliedUser.id, `⏣ ${coinAmount}`);
                        newMessage.react('✅');
                        newMessage.channel.send({
                            embeds: [{
                                title: 'Donation Note Set',
                                description: `Set note for **${repliedUser.tag}**\nCoins: **⏣ ${coinAmount}**\nTotal Donations: **${client.donations.get(repliedUser.id) || 0} coins**`,
                                color: 0x1abc9c
                            }]
                        });
                        newMessage.channel.send('Ignore this setnote. It\'s just a test.');
                    }
                }
            }
        } else if (!newMessage.author.bot) {
            // Save edited messages for sniping
            const editedSnipes = client.editedMessages.get(newMessage.channel.id) || [];
            editedSnipes.push({
                oldContent: oldMessage.content,
                newContent: newMessage.content,
                author: newMessage.author.tag,
                timestamp: Math.floor(Date.now() / 1000)
            });
            client.editedMessages.set(newMessage.channel.id, editedSnipes.slice(-5));
        }
    }
};
