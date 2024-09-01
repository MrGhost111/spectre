const { Client, GatewayIntentBits, Events, Collection, ButtonBuilder, ActionRowBuilder, EmbedBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
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
        if (interaction.customId === 'delete_snipe' || interaction.customId === 'delete_esnipe') {
            const originalMessage = await interaction.message.fetchReference().catch(() => null);

            if (originalMessage && originalMessage.author.id === interaction.user.id) {
                await interaction.message.delete();
                await interaction.reply({ content: 'Message deleted successfully.', ephemeral: true });
            } else {
                await interaction.reply({ content: 'You do not have permission to delete this message.', ephemeral: true });
            }
        } else if (interaction.customId === 'play_audio' || interaction.customId === 'replay_audio') {
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

            // Listen for audio completion
            audioPlayer.once(AudioPlayerStatus.Idle, async () => {
                console.log('Audio playback finished');

                // Provide replay/answer options
                const replayButton = new ButtonBuilder()
                    .setCustomId('replay_audio')
                    .setLabel('Replay')
                    .setStyle(ButtonStyle.Secondary);

                const answerButton = new ButtonBuilder()
                    .setCustomId('submit_answer')
                    .setLabel('Answer')
                    .setStyle(ButtonStyle.Success);

                const actionRow = new ActionRowBuilder().addComponents(replayButton, answerButton);

                const afterEmbed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('What would you like to do next?')
                    .setDescription('You can either replay the sound or submit your answer.')
                    .setTimestamp();

                await interaction.followUp({ embeds: [afterEmbed], components: [actionRow] });
            });

            audioPlayer.on('error', (error) => {
                console.error('Error playing audio:', error);
            });

            await interaction.reply({ content: 'Playing the sound. Listen and guess!', ephemeral: true });

            // Disable the replay button after use
            if (interaction.customId === 'replay_audio') {
                const buttonRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('replay_audio')
                        .setLabel('Replay')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('submit_answer')
                        .setLabel('Answer')
                        .setStyle(ButtonStyle.Success)
                );

                await interaction.message.edit({ components: [buttonRow] });
            }
        } else if (interaction.customId === 'submit_answer') {
            const answerModal = new ModalBuilder()
                .setCustomId('submit_answer_modal')
                .setTitle('Submit Your Guess');

            const answerInput = new TextInputBuilder()
                .setCustomId('answer_input')
                .setLabel('What sound did you hear?')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const actionRow = new ActionRowBuilder().addComponents(answerInput);
            answerModal.addComponents(actionRow);

            await interaction.showModal(answerModal);
        } else if (['create_channel', 'rename_channel', 'view_friends'].includes(interaction.customId)) {
            const mycCommand = client.commands.get('mychannel');
            if (mycCommand && mycCommand.handleInteraction) {
                await mycCommand.handleInteraction(interaction);
            }
        }
    } else if (interaction.isModalSubmit()) {
        if (interaction.customId === 'submit_answer_modal') {
            const userAnswer = interaction.fields.getTextInputValue('answer_input').toLowerCase();
            const correctAnswers = ['whale', 'humpback', 'humpback whale'];

            if (correctAnswers.includes(userAnswer)) {
                await interaction.reply({ content: 'Congratulations! You guessed it right!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'Sorry, that was not the correct answer. Try again!', ephemeral: true });
            }
        } else {
            const mycCommand = client.commands.get('mychannel');
            if (mycCommand && mycCommand.handleInteraction) {
                await mycCommand.handleInteraction(interaction);
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

    // Check for command using startsWith instead of exact match
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
