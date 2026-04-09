const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Displays a list of available commands.'),
    async execute(interaction) {
        try {
            console.log(`Executing help command for ${interaction.user.tag}`);

            // Check if the user has admin permissions
            const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
            console.log(`User ${interaction.user.tag} isAdmin: ${isAdmin}`);

            // Define normal and admin commands manually (sorted alphabetically)
            const normalCommands = [
                { name: '</addfriends:1277512176717791278>', description: 'Add friends to your channel' },
                { name: '`,b99`', description: 'Pick a random episode of Brooklyn Nine-Nine' },
                { name: '</mychannel:1279522613986725898> or `,myc`', description: 'Manage your channel' },
                { name: '`,esnipe`', description: 'Displays edited message' },
                { name: '`,hl`', description: 'Highlight system' },
                { name: '`,l2l`', description: 'Set up a last-to-leave event' },
                { name: '`,pin`', description: 'Pin/unpin a message' },
                { name: '`,resetcd`', description: 'Reset STFU command cooldown' },
                { name: '</removefriends:1277512176717791282>', description: 'Remove friends from your channel' },
                { name: '`,seec`', description: 'List all channels user is part of and ensure user is in those channels' },
                { name: '`,snipe`', description: 'Displays deleted message' },
                { name: '`,start`', description: 'Start the last-to-leave event' },
                { name: '`,stfu`', description: 'No need to explain what this is' },
                { name: '`help`', description: 'See the list of all commands' },
                { name: '`/promm`', description: 'Command for pro money maker to edit the role' }
            ];

            const adminCommands = [
                { name: 'Admin Command: `,updatedb`', description: 'to update bots database if a channel / user was added manuallyn ' },
                { name: 'Admin Command: `,editmm`', description: 'Add/remove donation notes from a money maker' },
                { name: 'Admin Command: `,resetweekly`', description: 'Reset money makers week manually' },
                { name: 'Admin Command: `,touchc`', description: 'Scan and fix channels with extra friends or missing owner/req' },
                { name: 'Admin Command: `,viewc`', description: 'See channel info of a given channel/user' },
                { name: '</assign:1277512176717791279>', description: 'Assign a channel to a user' },
                { name: '</faizlame:1278809991985496181>', description: 'Update channel topic to include owner’s ID (ignore the error at the end)' },
                { name: 'Mod Command: `,allow`', description: 'Let a user bypass auto kick/ban on join' },
                { name: 'Mod Command: `/say`', description: 'Make bot send a message' },
                { name: 'Staff Command: `,activity`', description: 'Staff command to see notes' },
                { name: 'Staff Command: `,viewchannel`', description: 'View channel info' }
            ];

            // Create embed to display the commands
            const embed = new EmbedBuilder()
                .setTitle('Available Commands')
                .setColor(0x0099FF) // Using hex color code
                .setDescription('Here is a list of available commands you can use:')
                .addFields(
                    { name: 'Normal Commands', value: normalCommands.map(cmd => `**${cmd.name}**: ${cmd.description}`).join('\n') || 'None' },
                    { name: 'Admin/mod/staff Commands', value: adminCommands.map(cmd => `**${cmd.name}**: ${cmd.description}`).join('\n') || 'None' }
                );

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