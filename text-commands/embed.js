const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inspectembed')
        .setDescription('Inspect the embed data of a message')
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('The message ID to inspect')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // Check if user is admin or you (753491023208120321)
        if (interaction.user.id !== '753491023208120321' &&
            !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ This command is for admins only!',
                ephemeral: true
            });
        }

        const messageId = interaction.options.getString('message_id');
        const channel = interaction.channel;

        try {
            const message = await channel.messages.fetch(messageId);

            if (!message.embeds || message.embeds.length === 0) {
                return interaction.reply({
                    content: '❌ This message has no embeds!',
                    ephemeral: true
                });
            }

            // Format embed data for display
            const embedData = message.embeds.map(embed => {
                return {
                    title: embed.title,
                    description: embed.description,
                    fields: embed.fields?.map(f => `${f.name}: ${f.value}`) || [],
                    footer: embed.footer?.text,
                    timestamp: embed.timestamp,
                    color: embed.color,
                    url: embed.url,
                    author: embed.author?.name,
                    image: embed.image?.url,
                    thumbnail: embed.thumbnail?.url
                };
            });

            // Send the embed data (truncate if too long)
            const embedJson = JSON.stringify(embedData, null, 2);
            const content = embedJson.length > 1900
                ? 'Embed data is too long - check console'
                : '```json\n' + embedJson + '\n```';

            await interaction.reply({
                content,
                ephemeral: true
            });

            // Also log to console if running in dev
            if (content.includes('too long')) {
                console.log('Embed Data:', embedData);
            }

        } catch (error) {
            console.error('Error inspecting embed:', error);
            await interaction.reply({
                content: `❌ Error fetching message: ${error.message}`,
                ephemeral: true
            });
        }
    }
};