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
    },
};
