const { Client, GatewayIntentBits, Events, Collection } = require('discord.js');
const fs = require('fs');
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

const textCommandFiles = fs.readdirSync('./text-commands').filter(file => file.endsWith('.js'));
for (const file of textCommandFiles) {
    const command = require(`./text-commands/${file}`);
    if (command.name) {
        client.textCommands.set(command.name, command);
    }
}

const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if (command.data && command.data.name) {
        client.commands.set(command.data.name, command);
    }
}

client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

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
        // Handle interactions for the `mychannel` command
        if (interaction.customId.startsWith('rename_channel') || interaction.customId.startsWith('view_friends') || interaction.customId.startsWith('create_channel') || interaction.customId.startsWith('create_channel_modal') || interaction.customId.startsWith('rename_channel_modal')) {
            const mycCommand = client.commands.get('mychannel'); // Get the `mychannel` command
            if (mycCommand && mycCommand.handleInteraction) {
                try {
                    await mycCommand.handleInteraction(interaction);
                    return; // Stop further processing if handled
                } catch (error) {
                    console.error(`Error handling mychannel interaction: ${error}`);
                    await interaction.reply({ content: 'There was an error handling this interaction!', ephemeral: true });
                }
            }
        }

        // Handle interactions for the `guess` command
        if (interaction.customId.startsWith('play_button') || interaction.customId.startsWith('guess')) {
            const guessCommand = client.textCommands.get('guess'); // Adjusting to use textCommands
            if (guessCommand && guessCommand.handleInteraction) {
                try {
                    await guessCommand.handleInteraction(interaction);
                } catch (error) {
                    console.error(`Error handling guess interaction: ${error}`);
                    await interaction.reply({ content: 'There was an error handling this interaction!', ephemeral: true });
                }
            }
        }
    }
});


client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

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

client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
    if (oldMessage.author.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const edits = client.editedMessages.get(oldMessage.channel.id) || [];
    edits.push({
        oldContent: oldMessage.content,
        author: oldMessage.author.tag,
        timestamp: Math.floor(Date.now() / 1000)
    });
    client.editedMessages.set(oldMessage.channel.id, edits.slice(-5));
});

client.login(process.env.DISCORD_TOKEN);
