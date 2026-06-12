const { SlashCommandBuilder, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const OWNER_ID = '753491023208120321';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deploycmd')
        .setDescription('Deploy a slash command to this server (owner only)')
        .addStringOption(option =>
            option
                .setName('command')
                .setDescription('Command to deploy')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction) {
        if (interaction.user.id !== OWNER_ID) return interaction.respond([]);
        const focused = interaction.options.getFocused().toLowerCase();
        const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.js') && f !== 'deploycmd.js');
        const choices = files
            .map(f => f.replace('.js', ''))
            .filter(name => name.includes(focused))
            .slice(0, 25)
            .map(name => ({ name, value: name }));
        await interaction.respond(choices);
    },

    async execute(interaction) {
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({ content: 'Only the bot owner can use this.', ephemeral: true });
        }

        const commandName = interaction.options.getString('command');
        const filePath = path.join(__dirname, `${commandName}.js`);

        if (!fs.existsSync(filePath)) {
            return interaction.reply({ content: `Command file \`${commandName}.js\` not found.`, ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            delete require.cache[require.resolve(filePath)];
            const command = require(filePath);

            if (!command.data) {
                return interaction.editReply(`\`${commandName}.js\` doesn't have a valid \`data\` export.`);
            }

            const commandData = typeof command.data.toJSON === 'function'
                ? command.data.toJSON()
                : command.data;

            const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
            const guildId = interaction.guildId;
            const clientId = process.env.CLIENT_ID;

            const existing = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
            const match = existing.find(c => c.name === commandData.name);

            if (match) {
                await rest.patch(
                    Routes.applicationGuildCommand(clientId, guildId, match.id),
                    { body: commandData }
                );
                await interaction.editReply(`✅ Updated \`/${commandData.name}\` in this server.`);
            } else {
                await rest.post(
                    Routes.applicationGuildCommands(clientId, guildId),
                    { body: commandData }
                );
                await interaction.editReply(`✅ Deployed \`/${commandData.name}\` to this server.`);
            }
        } catch (error) {
            console.error('[deploycmd] Error:', error);
            await interaction.editReply(`❌ Failed: \`${error.message}\``);
        }
    }
};
