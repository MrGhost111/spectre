const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'userselect',
    description: 'Shows user selection dropdown with embed',
    async execute(message, args) {
        try {
            if (!message || !message.guild) {
                console.error('Message or guild is undefined');
                return;
            }

            // Get guild members
            const members = await message.guild.members.cache
                .filter(member => !member.user.bot)
                .first(25);

            if (!members || members.length === 0) {
                await message.channel.send('No users found in the server.');
                return;
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('User Selection')
                .setDescription('Please select a user from the dropdown below')
                .setColor('#0099ff')
                .setTimestamp()
                .setFooter({ text: `Requested by ${message.author.tag}` });

            // Create dropdown with users
            const select = new StringSelectMenuBuilder()
                .setCustomId('user_select')
                .setPlaceholder('Select a user')
                .setMinValues(1)
                .setMaxValues(1);

            // Add users as options
            members.forEach(member => {
                select.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(member.user.username)
                        .setDescription(`ID: ${member.user.id}`)
                        .setValue(member.user.id)
                );
            });

            const row = new ActionRowBuilder().addComponents(select);

            // Send embed with dropdown
            const response = await message.channel.send({
                embeds: [embed],
                components: [row]
            });

            // Create collector for selection
            const collector = response.createMessageComponentCollector({
                time: 60000 // Timeout after 1 minute
            });

            collector.on('collect', async (interaction) => {
                if (interaction.customId === 'user_select') {
                    const selectedUserId = interaction.values[0];
                    const selectedUser = await interaction.guild.members.cache.get(selectedUserId);

                    if (!selectedUser) {
                        await interaction.update({
                            content: 'Selected user not found.',
                            components: []
                        });
                        return;
                    }

                    // Update embed with selection
                    const updatedEmbed = EmbedBuilder.from(embed)
                        .setDescription(`Selected user: ${selectedUser.user.tag}`);

                    await interaction.update({
                        embeds: [updatedEmbed],
                        components: []
                    });

                    // Example DM functionality - you can modify this part
                    try {
                        await selectedUser.send('You have been selected!');
                        await message.channel.send(`DM sent to ${selectedUser.user.tag} successfully!`);
                    } catch (error) {
                        console.error('Failed to send DM:', error);
                        await message.channel.send(`Failed to send DM to ${selectedUser.user.tag}.`);
                    }
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    const timeoutEmbed = EmbedBuilder.from(embed)
                        .setDescription('Selection timed out. Please try again.');

                    await response.edit({
                        embeds: [timeoutEmbed],
                        components: []
                    }).catch(console.error);
                }
            });

        } catch (error) {
            console.error('Error in userselect command:', error);
            if (message && message.channel) {
                await message.channel.send('An error occurred while setting up the user selection.');
            }
        }
    }
};
