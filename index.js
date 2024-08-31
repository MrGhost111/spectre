const { Client, GatewayIntentBits, Collection, Events, EmbedBuilder } = require('discord.js');
const fs = require('fs');
require('dotenv').config();
const myChannelHandler = require('./commands/myc.js'); // Import the command handler
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');

// Initialize the client with intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates, // Required for voice channel interactions
    ],
});

// Initialize snipedMessages, editedMessages, commands, and textCommands
client.snipedMessages = new Collection();
client.editedMessages = new Collection();
client.commands = new Collection();
client.textCommands = new Collection();

// Load slash command files
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if (command.data && command.data.name) {
        client.commands.set(command.data.name, command);
        console.log(`Loaded command: ${command.data.name}`); // Debug log
    }
}

// Load text command files
const textCommandFiles = fs.readdirSync('./text-commands').filter(file => file.endsWith('.js'));

for (const file of textCommandFiles) {
    const command = require(`./text-commands/${file}`);
    if (command.name) {
        client.textCommands.set(command.name, command);
        console.log(`Loaded text command: ${command.name}`); // Debug log
    }
}

// Voice player setup
const audioPlayer = createAudioPlayer();

client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.log(`Command ${interaction.commandName} not found`); // Debug log
            return;
        }

        try {
            await command.execute(interaction);
            console.log(`${interaction.commandName} command executed`);
        } catch (error) {
            console.error(`Error executing ${interaction.commandName}:`, error);
            await interaction.reply('There was an error trying to execute that command!');
        }
    } else if (interaction.isButton() || interaction.isModalSubmit()) {
        await myChannelHandler.handleInteraction(interaction);
    }
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    // Extract the command name from the message content
    const args = message.content.slice(1).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    // Handle the guess command to show an embed
    if (commandName === 'guess') {
        const guessEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Guess the Word')
            .setDescription('Try to guess the word! Type your guess below.')
            .setTimestamp();

        await message.channel.send({ embeds: [guessEmbed] });
        console.log('Guess command executed with embed');
        return;
    }
});

// Voice command handler: Example for future extension if needed
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    const prefix = '!'; // Define your prefix
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'play') {
        if (!args[0]) {
            return message.reply('Please provide a URL or search term to play.');
        }

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply('You need to be in a voice channel to play music!');
        }

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });

        const resource = createAudioResource(args[0]); // You can replace this with a more complex logic to handle different types of input

        audioPlayer.play(resource);
        connection.subscribe(audioPlayer);

        audioPlayer.once(AudioPlayerStatus.Idle, () => {
            connection.destroy(); // Leave the voice channel when the audio ends
        });

        return message.reply(`Now playing: ${args[0]}`);
    }
});

client.on(Events.MessageDelete, (message) => {
    if (message.author.bot) return;

    if (!client.snipedMessages.has(message.channel.id)) {
        client.snipedMessages.set(message.channel.id, []);
    }

    const snipedMessages = client.snipedMessages.get(message.channel.id);
    snipedMessages.push({
        content: message.content,
        author: message.author.username,
        timestamp: Math.floor(message.createdTimestamp / 1000), // Convert to Unix timestamp in seconds
    });

    // Keep only the last 100 sniped messages
    if (snipedMessages.length > 100) {
        snipedMessages.shift();
    }
});

client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
    if (oldMessage.author.bot || oldMessage.content === newMessage.content) return;

    if (!client.editedMessages.has(oldMessage.channel.id)) {
        client.editedMessages.set(oldMessage.channel.id, []);
    }

    const editedMessages = client.editedMessages.get(oldMessage.channel.id);
    editedMessages.push({
        oldContent: oldMessage.content,
        newContent: newMessage.content,
        author: oldMessage.author.username,
        timestamp: Math.floor(oldMessage.editedTimestamp / 1000), // Convert to Unix timestamp in seconds
    });

    // Keep only the last 100 edited messages
    if (editedMessages.length > 100) {
        editedMessages.shift();
    }
});

client.login(process.env.DISCORD_TOKEN);
