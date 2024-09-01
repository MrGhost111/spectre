const { Client, GatewayIntentBits, Events, Collection } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
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

const audioPlayer = createAudioPlayer();
const audioPath = '/home/ubuntu/spectre/audio/humpback_whale.mp3';

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
            await interaction.reply('There was an error executing this command!');
        }
    } else if (interaction.isButton()) {
        if (interaction.customId === 'play_audio') {
            const voiceChannel = interaction.member.voice.channel;
            if (!voiceChannel) {
                return interaction.reply({ content: 'You need to be in a voice channel to play audio!', ephemeral: true });
            }

            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            });

            const resource = createAudioResource(audioPath);
            audioPlayer.play(resource);
            connection.subscribe(audioPlayer);

            audioPlayer.once(AudioPlayerStatus.Idle, () => {
                console.log('Audio playback finished');
                connection.destroy();
            });

            audioPlayer.on('error', (error) => {
                console.error('Error playing audio:', error);
            });

            await interaction.reply({ content: 'Playing the sound. Listen and guess!', ephemeral: true });
        } else if (['create_channel', 'rename_channel', 'view_friends'].includes(interaction.customId)) {
            const mycCommand = client.commands.get('mychannel');
            if (mycCommand && mycCommand.handleInteraction) {
                await mycCommand.handleInteraction(interaction);
            }
        }
    } else if (interaction.isModalSubmit()) {
        const mycCommand = client.commands.get('mychannel');
        if (mycCommand && mycCommand.handleInteraction) {
            await mycCommand.handleInteraction(interaction);
        }
    }
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    const prefix = ',';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const textCommand = client.textCommands.get(commandName);
    if (textCommand) {
        try {
            await textCommand.execute(message, args);
        } catch (error) {
            console.error(`Error executing text command: ${error}`);
            await message.reply('There was an error trying to execute that command!');
        }
    }
});

// Event handler for message deletion (for snipe command)
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

// Event handler for message editing (for esnipe command)
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
