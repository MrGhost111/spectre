const { EmbedBuilder, Colors, PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'adminperms',
    description: 'Toggle admin permissions for a designated role (owner only)',

    // This works for BOTH traditional commands (,adminperms) AND AI commands (spectre give me admin)
    async execute(message, args = []) {
        // Check if the command is used by the bot owner
        const ownerId = '753491023208120321'; // Your user ID
        if (message.author.id !== ownerId) {
            return message.reply('❌ You do not have permission to use this command.');
        }

        // Admin role ID
        const adminRoleId = '866650164561969163';

        try {
            // Get the role
            const adminRole = message.guild.roles.cache.get(adminRoleId);
            if (!adminRole) {
                return message.reply('❌ Could not find the specified role. Please check the role ID.');
            }

            // Check if the role already has admin permissions
            const hasAdmin = adminRole.permissions.has(PermissionsBitField.Flags.Administrator);

            if (hasAdmin) {
                // Remove admin permissions by setting default permissions
                await adminRole.setPermissions([
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory
                ]);

                // Create success embed for removing permissions
                const embed = new EmbedBuilder()
                    .setTitle('🔓 Admin Permissions Removed')
                    .setDescription(`Successfully removed admin permissions from <@&${adminRoleId}>`)
                    .setColor(Colors.Red)
                    .setTimestamp()
                    .setFooter({ text: 'You are no longer an administrator' });

                return message.reply({ embeds: [embed] });
            } else {
                // Grant admin permissions
                await adminRole.setPermissions([PermissionsBitField.Flags.Administrator]);

                // Create success embed for granting permissions
                const embed = new EmbedBuilder()
                    .setTitle('🔒 Admin Permissions Granted')
                    .setDescription(`Successfully granted admin permissions to <@&${adminRoleId}>`)
                    .setColor(Colors.Green)
                    .setTimestamp()
                    .setFooter({ text: 'You now have administrator privileges' });

                return message.reply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error toggling admin permissions:', error);

            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('There was an error executing the command.')
                .setColor(Colors.Red)
                .addFields({ name: 'Error Details', value: `\`${error.message}\`` })
                .setTimestamp();

            return message.reply({ embeds: [errorEmbed] });
        }
    }
};