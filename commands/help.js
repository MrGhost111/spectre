const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Displays a list of available commands.'),
    async execute(interaction) {
        try {
            console.log(`Executing help command for ${interaction.user.tag}`);

            // Check if the user has admin permissions - use PermissionsBitField instead of PermissionFlagsBits
            const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
            console.log(`User ${interaction.user.tag} isAdmin: ${isAdmin}`);

            // Define normal and admin commands manually
            const normalCommands = [
                { name: '</mychannel:1279522613986725898> or `,myc`', description: 'Manage your channel' },
                { name: '</addfriends:1277512176717791278>', description: 'Add friends to your channel' },
                { name: '</removefriends:1277512176717791282>', description: 'Remove friends from your channel' },
                { name: '`,snipe`', description: 'Displays deleted message' },
                { name: '`,esnipe`', description: 'Displays edited message' }
            ];

            const adminCommands = [
                { name: '`,deadchannels`', description: 'Admin command to list channels whose owners are no longer in the server.' },
                { name: '`,seechannels`', description: 'Admin command to list all channels an admin user is part of.' },
                { name: '`,viewchannel`', description: 'Admin command to view channel info.' },
                { name: '</faizlame:1278809991985496181>', description: 'Update channel topic to include owners id. Ignore the error at the end.' },
                { name: '</assign:1277512176717791279>', description: 'Admin command to assign "CURRENT" channel to user' }
            ];

            // Create embed to display the commands
            const embed = new EmbedBuilder()
                .setTitle('Available Commands')
                .setColor(0x0099FF) // Using hex color code
                .setDescription('Here is a list of available commands you can use:')
                .addFields(
                    { name: 'Normal Commands', value: normalCommands.map(cmd => `**${cmd.name}**: ${cmd.description}`).join('\n') || 'None' }
                );

            if (isAdmin) {
                embed.addFields(
                    { name: 'Admin Commands', value: adminCommands.map(cmd => `**${cmd.name}**: ${cmd.description}`).join('\n') || 'None' }
                );
            }

            try {
                console.log('Sending help command reply');
                await interaction.reply({ embeds: [embed], ephemeral: false });
                console.log('Help command reply sent successfully');
            } catch (error) {
                console.error('Error sending help command reply:', error);
                // Try with ephemeral as a fallback
                try {
                    await interaction.reply({
                        content: 'There was an error displaying the help menu. Try again later.',
                        ephemeral: true
                    });
                } catch (secondError) {
                    console.error('Failed to send fallback error message:', secondError);
                }
            }
        } catch (error) {
            console.error('Uncaught error in help command:', error);
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'An unexpected error occurred while processing this command.',
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                console.error('Failed to send error message:', replyError);
            }
        }
    }
};