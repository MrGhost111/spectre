const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');

const usersFilePath = path.join(__dirname, '../data/users.json');
const itemsFilePath = path.join(__dirname, '../data/items.json');

let usersData = require(usersFilePath);
const itemsData = require(itemsFilePath);

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
                    const itemPrice = itemsData[itemName];

                    if (itemPrice) {
                        const totalValue = amount * itemPrice;
                        const repliedUser = newMessage.interaction?.user || newMessage.author;
                        if (repliedUser) {
                            // Set donation note directly
                            const userId = repliedUser.id;
                            const currentDonations = usersData[userId]?.total || 0;
                            usersData[userId] = {
                                total: currentDonations + totalValue,
                                donations: usersData[userId]?.donations || {}
                            };
                            usersData[userId].donations[itemName] = (usersData[userId].donations[itemName] || 0) + totalValue;

                            // Save updated data
                            fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));

                            // Add remove button
                            const removeButton = new ButtonBuilder()
                                .setCustomId(remove_donation_${userId}_${totalValue})
                                .setEmoji('<:delete:1279632440343789659>')
                                .setStyle(ButtonStyle.Danger);

                            const row = new ActionRowBuilder().addComponents(removeButton);

                            newMessage.react('✅');
                            newMessage.channel.send({
                                embeds: [new EmbedBuilder()
                                    .setTitle('Donation Note Set')
                                    .setDescription(<:YJ_streak:1259258046924853421> **Donor:** ${repliedUser.tag}\n<:prize:1000016483369369650> **Donated:** ${amount.toLocaleString()}x ${itemName} (${itemPrice.toLocaleString()} each)\n<:req:1000019378730975282> **Total:** ${totalValue.toLocaleString()} coins\n<:lbtest:1064919048242090054> **Total Donations:** ${usersData[userId].total.toLocaleString()} coins)
                                    .setColor(0x6666ff)
                                ],
                                components: [row]
                            });
                            newMessage.channel.send('Ignore this setnote. It\'s just a test.');
                        }
                    } else {
                        newMessage.channel.send({
                            embeds: [new EmbedBuilder()
                                .setTitle('Item Not Found')
                                .setDescription(Item **${itemName}** not found. Please run the Dank Memer command **/item ${itemName}** to add it to the database.)
                                .setColor(0x6666ff)
                            ]
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
                        // Set donation note directly
                        const userId = repliedUser.id;
                        const currentDonations = usersData[userId]?.total || 0;
                        usersData[userId] = {
                            total: currentDonations + coinAmount,
                            donations: usersData[userId]?.donations || {}
                        };

                        // Save updated data
                        fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));

                        // Add remove button
                        const removeButton = new ButtonBuilder()
                            .setCustomId(remove_donation_${userId}_${coinAmount})
                            .setEmoji('<:delete:1279632440343789659>')
                            .setStyle(ButtonStyle.Danger);

                        const row = new ActionRowBuilder().addComponents(removeButton);

                        newMessage.react('✅');
                        newMessage.channel.send({
                            embeds: [new EmbedBuilder()
                                .setTitle('Donation Note Set')
                                .setDescription(<:YJ_streak:1259258046924853421> **Donor:** ${repliedUser.tag}\n<:prize:1000016483369369650> **Donated:** ⏣ ${coinAmount.toLocaleString()}\n<:lbtest:1064919048242090054> **Total Donations:** ${usersData[userId].total.toLocaleString()} coins)
                                .setColor(0x6666ff)
                            ],
                            components: [row]
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
    },
};
