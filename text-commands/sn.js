const fs = require('fs');
const path = require('path');
const fuzz = require('fuzzball'); // Make sure to install this or use an alternative fuzzy matching library

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
            user = message.client.users.cache.find(u => u.id === userArg || u.username === userArg);
            if (!user) return message.reply('User not found.');
        }

        // Load items from items.json
        const itemFilePath = path.join(__dirname, '..', 'data', 'items.json');
        let itemPrices = new Map();
        if (fs.existsSync(itemFilePath)) {
            try {
                const rawData = fs.readFileSync(itemFilePath, 'utf8');
                itemPrices = new Map(Object.entries(JSON.parse(rawData)));
            } catch (error) {
                console.error('Error reading or parsing items.json:', error);
                return message.reply('There was an error reading the item data.');
            }
        }

        // Convert amount to number
        let amount;
        if (!isNaN(amountArg)) {
            amount = convertToNumber(amountArg);
        } else {
            return message.reply('Invalid amount format.');
        }

        // Check for item
        let item;
        if (itemArg) {
            item = findBestItemMatch(itemArg, itemPrices);
            if (!item) {
                return message.reply('Item not found. Please check the name or add it to the database.');
            }
        }

        // Handle the donation note
        const note = item ? `${amount}x ${item}` : `⏣ ${amount}`;

        // Load users from users.json and update donation data
        const userFilePath = path.join(__dirname, '..', 'data', 'users.json');
        let usersData = {};
        if (fs.existsSync(userFilePath)) {
            try {
                const rawData = fs.readFileSync(userFilePath, 'utf8');
                usersData = JSON.parse(rawData);
            } catch (error) {
                console.error('Error reading or parsing users.json:', error);
                return message.reply('There was an error reading the user data.');
            }
        }

        if (!usersData[user.id]) {
            usersData[user.id] = { total: 0 };
        }
        if (item) {
            const itemPrice = itemPrices.get(item);
            if (itemPrice) {
                usersData[user.id].total += amount * itemPrice;
            } else {
                return message.reply(`Price for item **${item}** not found.`);
            }
        } else {
            usersData[user.id].total += amount;
        }
        fs.writeFileSync(userFilePath, JSON.stringify(usersData, null, 2), 'utf8');

        // Reply to the user
        const totalDonations = usersData[user.id].total;
        message.channel.send({
            embeds: [{
                title: 'Donation Note Set',
                description: `Set note for **${user.tag}**\n${note}\nTotal Donations: **${totalDonations.toLocaleString()} coins**`,
                color: 0x1abc9c
            }]
        });
    }
};
