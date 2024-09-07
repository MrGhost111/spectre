const { Client, GatewayIntentBits, Events, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

client.commands = new Collection();
client.textCommands = new Collection();
client.snipedMessages = new Collection();
client.editedMessages = new Collection();
client.itemPrices = new Map(); // Store item prices here
client.donations = new Map(); // Track total donations here

// Load existing items from items.json
const loadItems = () => {
    const filePath = path.join(__dirname, 'data', 'items.json');
    if (fs.existsSync(filePath)) {
        const rawData = fs.readFileSync(filePath, 'utf8');
        const items = JSON.parse(rawData);
        for (const [itemName, itemPrice] of Object.entries(items)) {
            client.itemPrices.set(itemName, itemPrice);
        }
    }
};

// Function to save items to items.json
const saveItems = () => {
    const filePath = path.join(__dirname, 'data', 'items.json');
    const items = Object.fromEntries(client.itemPrices);
    fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf8');
};

// Load text commands
const textCommandFiles = fs.readdirSync('./text-commands').filter(file => file.endsWith('.js'));
for (const file of textCommandFiles) {
    const command = require(`./text-commands/${file}`);
    if (command.name) {
        client.textCommands.set(command.name, command);
    }
}

// Load slash commands
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if (command.data && command.data.name) {
        client.commands.set(command.data.name, command);
    }
}

client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}!`);
    // Load existing items
    loadItems();
});

// Function to set donation note
const setDonationNote = async (userId, note) => {
    const filePath = path.join(__dirname, 'data', 'users.json');
    let usersData = {};
    if (fs.existsSync(filePath)) {
        const rawData = fs.readFileSync(filePath, 'utf8');
        usersData = JSON.parse(rawData);
    }

    if (!usersData[userId]) {
        usersData[userId] = { total: 0 };
    }

    // Add donation to total
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
};

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`Error executing command: ${error}`);
            await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
        }
    } else if (interaction.isButton() || interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('rename_channel') || interaction.customId.startsWith('view_friends') || interaction.customId.startsWith('create_channel') || interaction.customId.startsWith('create_channel_modal') || interaction.customId.startsWith('rename_channel_modal')) {
            const mycCommand = client.commands.get('mychannel');
            if (mycCommand && mycCommand.handleInteraction) {
                try {
                    await mycCommand.handleInteraction(interaction);
                    return;
                } catch (error) {
                    console.error(`Error handling mychannel interaction: ${error}`);
                    await interaction.reply({ content: 'There was an error handling this interaction!', ephemeral: true });
                }
            }
        }

        const guessCommand = client.textCommands.get('guess');
        if (guessCommand && (interaction.customId === 'play_audio' || interaction.customId === 'replay_audio' || interaction.customId === 'submit_answer' || interaction.customId === 'submit_answer_modal' || interaction.customId === 'next_audio')) {
            try {
                if (interaction.isModalSubmit()) {
                    await guessCommand.handleModalSubmit(interaction);
                } else {
                    await guessCommand.handleInteraction(interaction);
                }
                return;
            } catch (error) {
                console.error(`Error handling guess interaction: ${error}`);
                await interaction.reply({ content: 'There was an error handling this interaction!', ephemeral: true });
            }
        }
    }
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) {
        if (message.author.id === '270904126974590976' && message.embeds.length > 0) {
            const embed = message.embeds[0];
            const itemName = embed.title || 'Unknown Item';

            const averageValueField = embed.fields.find(field => field.name === 'Market' && field.value.includes('Average Value'));
            if (averageValueField) {
                const averageValueMatch = averageValueField.value.match(/Average Value:\s*⏣\s*([0-9,]+)/);
                if (averageValueMatch) {
                    const averageValue = parseInt(averageValueMatch[1].replace(/,/g, ''), 10);
                    const previousValue = client.itemPrices.get(itemName);
                    if (previousValue !== undefined) {
                        if (previousValue !== averageValue) {
                            client.itemPrices.set(itemName, averageValue);
                            message.channel.send(`Updated item **${itemName}**'s price to **${averageValue}** coins.`);
                        }
                    } else {
                        client.itemPrices.set(itemName, averageValue);
                        message.channel.send(`Added item **${itemName}** with price **${averageValue}** coins.`);
                    }
                    saveItems(); // Ensure this is called after updating the price
                    console.log(`Updated/Added price of ${itemName} to ${averageValue}`);
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
});

client.on(Events.MessageDelete, message => {
    if (message.author.bot) return;

    const snipes = client.snipedMessages.get(message.channel.id) || [];
    snipes.push({
        content: message.content,
        author: message.author.tag,
        timestamp: Math.floor(Date.now() / 1000)
    });
    client.snipedMessages.set(message.channel.id, snipes.slice(-5));
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    if (newMessage.author.bot && newMessage.author.id === '270904126974590976' && newMessage.embeds.length > 0) {
        const embed = newMessage.embeds[0];
        const description = embed.description || '';

        // Detect item donation
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
                        await setDonationNote(repliedUser.id, `${totalValue} (${amount}x ${itemName})`);
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
        }
        // Detect coin donation
        else if (description.includes('Successfully donated') && description.includes('⏣')) {
            console.log('Detected a coin donation:', description);
            const coinAmountMatch = description.match(/⏣\s*([\d,]+)/);
            if (coinAmountMatch) {
                const coinAmount = parseInt(coinAmountMatch[1].replace(/,/g, ''), 10);
                const repliedUser = newMessage.interaction?.user || newMessage.author;
                if (repliedUser) {
                    await setDonationNote(repliedUser.id, `⏣ ${coinAmount}`);
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
    }
});

client.login(process.env.DISCORD_TOKEN);
