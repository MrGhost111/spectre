const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('allow')
        .setDescription('Allows a new account from a specific user to join despite age restrictions.')
        .addStringOption(option =>
            option.setName('userid')
                .setDescription('The user ID to allow.')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

    async execute(interaction) {
        // Defer reply to give more time for processing
        await interaction.deferReply({ ephemeral: true });

        // Get the user ID from options
        const userId = interaction.options.getString('userid');

        // Validate if the input is a valid user ID format
        if (!/^\d{17,19}$/.test(userId)) {
            return interaction.editReply('Please provide a valid user ID.');
        }

        try {
            // Read the current allow list
            const allowListPath = path.join(__dirname, '..', 'data', 'allow.json');
            let allowList = {};

            try {
                const data = await fs.readFile(allowListPath, 'utf8');
                allowList = JSON.parse(data);
            } catch (error) {
                // If file doesn't exist or is invalid, we'll start with an empty object
                if (error.code !== 'ENOENT') {
                    console.error('Error reading allow list:', error);
                }
            }

            // Add the user to the allow list
            allowList[userId] = {
                allowedAt: Date.now(),
                allowedBy: interaction.user.id
            };

            // Save the updated allow list
            await fs.writeFile(allowListPath, JSON.stringify(allowList, null, 2));

            // Create embed for response
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('User Allowed')
                .setDescription(`User ID \`${userId}\` has been added to the allow list.`)
                .addFields(
                    { name: 'Allowed By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Allowed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                );

            // Send the confirmation message
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in allow command:', error);
            await interaction.editReply('There was an error processing your request. Please try again later.');
        }
    },
};