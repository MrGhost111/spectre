const { Client, GatewayIntentBits, Collection, Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
    ],
});

client.commands = new Collection();

// Load command files
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
            console.log(`${interaction.commandName} command executed`);
        } catch (error) {
            console.error(`Error executing ${interaction.commandName}:`, error);
            await interaction.reply('There was an error trying to execute that command!');
        }
    } else if (interaction.isButton()) {
        const dataPath = './data/channels.json';
        const channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

        // Ensure the button is author-only
        const userChannel = Object.values(channelsData).find(ch => ch.userId === interaction.user.id);
        
        if (interaction.customId === 'create_channel') {
            if (userChannel) {
                await interaction.reply({ content: "You already own a channel.", ephemeral: true });
                return;
            }

            const modal = new ModalBuilder()
                .setCustomId('create_channel_modal')
                .setTitle('Create Your Channel');

            const nameInput = new TextInputBuilder()
                .setCustomId('channel_name_input')
                .setLabel('Channel Name')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const actionRow = new ActionRowBuilder().addComponents(nameInput);
            modal.addComponents(actionRow);

            await interaction.showModal(modal);
        } else if (interaction.customId === 'rename_channel') {
            // Check if the user is the owner of the channel
            if (!userChannel || userChannel.userId !== interaction.user.id) {
                await interaction.reply({ content: "You don't own a channel.", ephemeral: true });
                return;
            }

            const modal = new ModalBuilder()
                .setCustomId('rename_channel_modal')
                .setTitle('Rename Your Channel');

            const nameInput = new TextInputBuilder()
                .setCustomId('new_channel_name_input')
                .setLabel('New Channel Name')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const actionRow = new ActionRowBuilder().addComponents(nameInput);
            modal.addComponents(actionRow);

            await interaction.showModal(modal);
        } else if (interaction.customId === 'view_friends') {
            // Check if the user is the owner of the channel
            if (!userChannel || userChannel.userId !== interaction.user.id) {
                await interaction.reply({ content: "You don't own a channel.", ephemeral: true });
                return;
            }

            const friends = userChannel.friends;
            const friendsMentions = friends.map(friendId => `<@${friendId}>`).join('\n');
            const totalFriends = friends.length;

            const embed = new EmbedBuilder()
                .setTitle(`Friends (${totalFriends}/${calculateMaxFriends(interaction.member)})`)
                .setDescription(friendsMentions || 'No friends added.');

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    } else if (interaction.isModalSubmit()) {
        if (interaction.customId === 'create_channel_modal') {
            const channelName = interaction.fields.getTextInputValue('channel_name_input');
            const dataPath = './data/channels.json';
            const channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

            const existingChannel = Object.values(channelsData).find(ch => ch.channelId && interaction.guild.channels.cache.get(ch.channelId));
            if (existingChannel) {
                delete channelsData[existingChannel.userId];
                fs.writeFileSync(dataPath, JSON.stringify(channelsData, null, 2));
            }

            const categoryId = '842471433238347786';
            let category = interaction.guild.channels.cache.get(categoryId);
            if (!category || category.children.size >= 50) {
                category = interaction.guild.channels.cache.get('1064095644811284490');
            }

            const newChannel = await interaction.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: category,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        deny: [PermissionsBitField.Flags.ViewChannel],
                    },
                    {
                        id: interaction.user.id,
                        allow: [PermissionsBitField.Flags.ViewChannel],
                    },
                ],
            });

            channelsData[interaction.user.id] = {
                userId: interaction.user.id,
                channelId: newChannel.id,
                createdAt: new Date().toISOString(),
                friends: [],
            };
            fs.writeFileSync(dataPath, JSON.stringify(channelsData, null, 2));

            await interaction.reply({ content: `Channel <#${newChannel.id}> created successfully!`, ephemeral: true });
        } else if (interaction.customId === 'rename_channel_modal') {
            const newName = interaction.fields.getTextInputValue('new_channel_name_input');
            const dataPath = './data/channels.json';
            const channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

            const userChannel = Object.values(channelsData).find(ch => ch.userId === interaction.user.id);
            if (!userChannel) {
                await interaction.reply({ content: "You don't own a channel.", ephemeral: true });
                return;
            }

            const channel = interaction.guild.channels.cache.get(userChannel.channelId);
            if (channel) {
                await channel.setName(newName);
                await interaction.reply({ content: `Channel renamed to ${newName}!`, ephemeral: true });
            } else {
                await interaction.reply({ content: "Channel not found.", ephemeral: true });
            }
        }
    }
});

function calculateMaxFriends(member) {
    const roleLimits = {
        '768448955804811274': 5,
        '768449168297033769': 5,
        '946729964328337408': 5,
        '1028256286560763984': 2,
        '1028256279124250624': 3,
        '1038106794200932512': 5,
    };
    let totalLimit = 0;
    for (const roleId in roleLimits) {
        if (member.roles.cache.has(roleId)) {
            totalLimit += roleLimits[roleId];
        }
    }
    return totalLimit;
}

client.login(process.env.DISCORD_TOKEN);
