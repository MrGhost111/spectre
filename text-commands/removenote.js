const { EmbedBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

module.exports = {
    name: 'removenote',
    alias: 'rn',
    description: 'Remove donation amount from a user',
    async execute(message, args) {
        const requiredRole = '710572344745132114';
        if (!message.member.roles.cache.has(requiredRole)) {
            return message.reply('You do not have the required role to use this command.');
        }

        if (args.length < 2) {
            return message.reply('Please provide both a user and an amount.');
        }

        const userInput = args[0];
        const amountInput = args.slice(1).join(' ');

        const amount = parseAmount(amountInput);
        if (amount === null) {
            return message.reply('Invalid amount format. Use plain numbers, abbreviations (k, m, b), or scientific notation.');
        }

        const userId = await getUserIdFromInput(userInput, message);
        if (!userId) {
            return message.reply('User not found.');
        }

        const filePath = path.join(__dirname, '..', 'data', 'users.json');
        if (!fs.existsSync(filePath)) {
            return message.reply('No data file found.');
        }

        const rawData = fs.readFileSync(filePath, 'utf8');
        const users = JSON.parse(rawData);

        if (!users[userId]) {
            return message.reply('User has no donation record.');
        }

        users[userId].total = Math.max(0, users[userId].total - amount);

        fs.writeFileSync(filePath, JSON.stringify(users, null, 2), 'utf8');

        const user = message.guild.members.cache.get(userId) || { user: { tag: 'Unknown User' } };

        const embed = new EmbedBuilder()
            .setTitle(`Donation Note Updated for ${user.user.tag}`)
            .setDescription(`Total Donations: ⏣ ${users[userId].total.toLocaleString()}`)
            .setColor('#6666FF');

        message.channel.send({ embeds: [embed] });
    },
};

function parseAmount(input) {
    if (input.includes('k')) return parseFloat(input.replace('k', '').trim()) * 1000;
    if (input.includes('m')) return parseFloat(input.replace('m', '').trim()) * 1000000;
    if (input.includes('b')) return parseFloat(input.replace('b', '').trim()) * 1000000000;
    if (input.includes('e')) return parseFloat(input);
    return parseFloat(input);
}

async function getUserIdFromInput(input, message) {
    const userMention = message.mentions.users.first();
    if (userMention) return userMention.id;

    const user = message.guild.members.cache.find(member => member.user.username === input);
    if (user) return user.id;

    if (!isNaN(input)) return input;

    return null;
}
