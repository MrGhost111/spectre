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

// Function to save items to items.json
const saveItems = () => {
    const filePath = path.join(__dirname, 'data', 'items.json');
    const items = Object.fromEntries(client.itemPrices);
    fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf8');
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
            // Extract the item name from the embed title
            const itemName = embed.title || 'Unknown Item';

            // Extract average value from the embed fields
            const averageValueField = embed.fields.find(field => field.name === 'Market' && field.value.includes('Average Value'));
            if (averageValueField) {
                const averageValueMatch = averageValueField.value.match(/Average Value:\s*⏣\s*([0-9,]+)/);
                if (averageValueMatch) {
                    const averageValue = parseInt(averageValueMatch[1].replace(/,/g, ''), 10);

                    // Check and update item price
                    const previousValue = client.itemPrices.get(itemName);
                    if (previousValue) {
                        client.itemPrices.set(itemName, averageValue);
                        message.channel.send(`Updated item **${itemName}**'s price to **${averageValue}** coins.`);
                    } else {
                        client.itemPrices.set(itemName, averageValue);
                        message.channel.send(`Added item **${itemName}** with price **${averageValue}** coins.`);
                    }

                    // Save items to items.json
                    saveItems(); 
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
    if (oldMessage.author.bot) return;
    if (oldMessage.content === newMessage.content) return;

    // Ensure the update message is from Dank Memer
    if (newMessage.author.id === '270904126974590976') {
        const description = newMessage.content;

        if (description.includes('Successfully donated')) {
            let totalValue;

            if (description.includes('⏣')) {
                // Coins donation
                const amountMatch = description.match(/Successfully donated ⏣ ([\d,]+)/);
                if (amountMatch) {
                    const amount = parseInt(amountMatch[1].replace(/,/g, ''), 10);
                    totalValue = amount;
                    newMessage.channel.send(`Total value: ⏣ ${totalValue}`);
                }
            } else if (description.includes(':') && description.includes(' ')) {
                // Items donation
                const [numberOfItems, itemName] = description.split(':');
                const itemMatch = itemName.match(/([^\s]+)\s*(.*)/);
                const itemPrice = client.itemPrices.get(itemMatch[2]);

                if (itemPrice) {
                    const numberOfItemsValue = parseInt(numberOfItems.replace(/,/g, ''), 10);
                    totalValue = numberOfItemsValue * itemPrice;
                    newMessage.channel.send(`Total value: ⏣ ${totalValue}`);
                } else {
                    newMessage.channel.send('Item price not found. Please use /item to add/update the item price.');
                }
            }
        }
    }

    // Log message updates
    const edits = client.editedMessages.get(oldMessage.channel.id) || [];
    edits.push({
        oldContent: oldMessage.content,
        author: oldMessage.author.tag,
        timestamp: Math.floor(Date.now() / 1000)
    });
    client.editedMessages.set(oldMessage.channel.id, edits.slice(-5));
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    if (oldState.channelId && !newState.channelId) {
        const guessCommand = client.textCommands.get('guess');
        if (guessCommand && guessCommand.voiceConnections) {
            const userId = oldState.id;
            for (const [guildId, connection] of guessCommand.voiceConnections.entries()) {
                if (connection.channel.members.has(userId)) {
                    connection.disconnect();
                    guessCommand.voiceConnections.delete(guildId);
                    console.log(`Disconnected from voice channel as the user left: ${userId}`);
                    break;
                }
            }
        }
    }
});

client.login(process.env.BOT_TOKEN);
