const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const usersFilePath = path.join(__dirname, '../data/users.json');
const itemsFilePath = path.join(__dirname, '../data/items.json');
let usersData = require(usersFilePath);
const itemsData = require(itemsFilePath);

let lastMessageId = null; // Store the ID of our counter message

module.exports = {
    name: Events.MessageUpdate,
    async execute(client, oldMessage, newMessage) {
        // Original code for tracking edited messages
        if (!newMessage.author.bot) {
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

        // New code for tracking the specific message
        if (newMessage.id === '1315178334325571635') {
            const embed = newMessage.embeds[0];
            if (!embed) return;

            const description = embed.description || embed.data?.description;
            if (!description) return;

            // Extract winnings using regex
            const winningsMatch = description.match(/Winnings:\s*\*\*⏣\s*([-\d,]+)\*\*/);
            if (!winningsMatch) return;

            // Remove commas and convert to number
            const winningsAmount = parseInt(winningsMatch[1].replace(/,/g, ''));
            
            // Determine if it's a win or loss
            const count = winningsAmount < 0 ? -1 : +1;

            try {
                if (!lastMessageId) {
                    // Create new tracking message
                    const sent = await newMessage.channel.send(`Count: ${count}`);
                    lastMessageId = sent.id;
                } else {
                    // Try to fetch and update existing message
                    try {
                        const messageToEdit = await newMessage.channel.messages.fetch(lastMessageId);
                        const currentCount = parseInt(messageToEdit.content.split(': ')[1]);
                        await messageToEdit.edit(`Count: ${currentCount + count}`);
                    } catch (err) {
                        // If message not found, create new one
                        const sent = await newMessage.channel.send(`Count: ${count}`);
                        lastMessageId = sent.id;
                    }
                }
            } catch (error) {
                console.error('Error handling tracking message:', error);
            }
        }
    },
};
