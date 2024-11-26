const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('weeklyroles')
        .setDescription('Manage weekly winner roles')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('role')
                .setDescription('Select which weekly winner role to manage')
                .setRequired(true)
                .addChoices(
                    { name: 'Weekly Winner #1', value: '1299465385715961957' },
                    { name: 'Weekly Winner #2', value: '1310592071781843034' },
                    { name: 'Weekly Winner #3', value: '1310864766872453140' }
                )
        )
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Select the new winner')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('role_name')
                .setDescription('New name for the role')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('role_color')
                .setDescription('New color for the role (hex code)')
                .setRequired(true)
        )
        .addAttachmentOption(option =>
            option.setName('role_icon')
                .setDescription('New icon for the role')
                .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            // Get all the options
            const roleId = interaction.options.getString('role');
            const newWinner = interaction.options.getMember('user');
            const newRoleName = interaction.options.getString('role_name');
            const newRoleColor = interaction.options.getString('role_color');
            const newRoleIcon = interaction.options.getAttachment('role_icon');

            // Get the role
            const role = await interaction.guild.roles.fetch(roleId);
            if (!role) {
                return await interaction.editReply('Could not find the specified role.');
            }

            // Find and remove role from all current members who have it
            const membersWithRole = role.members;
            for (const [memberId, member] of membersWithRole) {
                await member.roles.remove(role);
            }

            // Update role properties
            const updateData = {
                name: newRoleName,
                color: newRoleColor.replace('#', ''),  // Remove # if present
            };

            // If an icon was provided, add it to the update data
            if (newRoleIcon) {
                // Fetch the icon data
                const iconResponse = await fetch(newRoleIcon.url);
                const iconBuffer = Buffer.from(await iconResponse.arrayBuffer());
                updateData.icon = iconBuffer;
            }

            // Update the role
            await role.edit(updateData);

            // Assign role to new winner
            await newWinner.roles.add(role);

            // Create success embed
            const embed = new EmbedBuilder()
                .setTitle('Weekly Winner Role Updated')
                .setColor(Colors.Green)
                .addFields(
                    { name: 'Role', value: role.name, inline: true },
                    { name: 'New Winner', value: newWinner.toString(), inline: true },
                    { name: 'New Role Name', value: newRoleName, inline: true },
                    { name: 'New Role Color', value: `#${newRoleColor.replace('#', '')}`, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            await interaction.editReply('An error occurred while updating the weekly winner role.');
        }
    }
};
