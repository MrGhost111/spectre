const { CommandInteraction, Message } = require('discord.js');
const fuzz = require('fuzzball'); // You can use 'fuzzball' or any other fuzzy matching library
const path = require('path');
const fs = require('fs');

// Helper functions for converting shorthand numbers
const convertToNumber = (str) => {
    const multipliers = { k: 1e3, m: 1e6, b: 1e9, e: 1e12 };
    const match = str.match(/^(\d+)([kmbe]?)$/i);
    if (match) {
        const [_, number, suffix] = match;
        return parseFloat(number) * (multipliers[suffix.toLowerCase()] || 1);
    }
    return parseFloat(str);
};

// Fuzzy match function for items
const findBestItemMatch = (itemName, itemPrices) => {
    const items = Array.from(itemPrices.keys());
    const bestMatch = fuzz.extractOne(itemName, items);
    return bestMatch ? bestMatch[0] : null;
};

// Command Execution Function
module.exports = {
    name: 'setnote',
    alias: ['sn'],
    description: 'Sets a donation note for a user with optional item and amount.',
    async execute(message, args) {
        if (args.length < 2) {
            return message.reply('Usage: ,sn <user> <amount> [item]');
        }

        const userArg = args.shift();
        const amountArg = args.shift();
        const itemArg = args.join(' ');

        // Resolve user from mention, ID, or username
        let user;
        if (message.mentions.users.size > 0) {
            user = message.mentions.users.first();
        } else {
            const id = message.client.users.cache.find(u => u.id === userArg);
            if (id) user = id;
            if (!user) user = message.client.users.cache.find(u => u.username === userArg);
            if (!user) return message.reply('User not found.');
        }

        // Convert amount to number
        let amount;
        if (!isNaN(amountArg)) {
            amount = convertToNumber(amountArg);
        } else {
            amount = 0;
        }

        // Check for item
        let item;
        if (itemArg) {
            item = findBestItemMatch(itemArg, message.client.itemPrices);
            if (!item) return message.reply('Item not found. Please check the name or add it to the database.');
        }

        // Handle the donation note
        const note = item ? `${amount}x ${item}` : `⏣ ${amount}`;
        await setDonationNote(user.id, note);

        // Reply to the user
        const totalDonations = message.client.donations.get(user.id) || 0;
        message.channel.send({
            embeds: [{
                title: 'Donation Note Set',
                description: `Set note for **${user.tag}**\n${note}\nTotal Donations: **${totalDonations} coins**`,
                color: 0x1abc9c
            }]
        });
    }
};

// Function to set donation note (similar to index.js)
async function setDonationNote(userId, note) {
    const filePath = path.join(__dirname, '..', 'data', 'users.json');
    let usersData = {};
    if (fs.existsSync(filePath)) {
        const rawData = fs.readFileSync(filePath, 'utf8');
        usersData = JSON.parse(rawData);
    }

    if (!usersData[userId]) {
        usersData[userId] = { total: 0 };
    }

    const donationAmount = note.includes('⏣') ? parseInt(note.replace('⏣ ', '').replace(/,/g, ''), 10) : 0;
    const itemMatch = note.match(/(\d+)x (.+)/);
    if (itemMatch) {
        const itemAmount = parseInt(itemMatch[1], 10);
        const itemName = itemMatch[2];
        const itemPrice = client.itemPrices.get(itemName);
        if (itemPrice) {
            usersData[userId].total += itemAmount * itemPrice;
        }
    } else {
        usersData[userId].total += donationAmount;
    }

    fs.writeFileSync(filePath, JSON.stringify(usersData, null, 2), 'utf8');
    client.donations.set(userId, usersData[userId].total); // Update in memory
}
