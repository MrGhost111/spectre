const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('edit_pro_mm')
        .setDescription('Edit the Pro Money Maker role appearance')
        .addStringOption(option =>
            option.setName('color')
                .setDescription('New color for the role (hex code)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('emoji')
                .setDescription('Server emoji to use as role icon (use emoji format like :emoji:)')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option.setName('custom_icon')
                .setDescription('Upload a custom image to use as role icon')
                .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const PRO_MM_ROLE_ID = '838478632451178506';

            // Check if user has the Pro Money Maker role
            const member = interaction.member;
            if (!member.roles.cache.has(PRO_MM_ROLE_ID)) {
                return await interaction.editReply('You must have the Pro Money Maker role to use this command.');
            }

            // Get the role
            const role = await interaction.guild.roles.fetch(PRO_MM_ROLE_ID);
            if (!role) {
                return await interaction.editReply('Could not find the Pro Money Maker role. Please contact an administrator.');
            }

            // Get options
            const newRoleColor = interaction.options.getString('color');
            const emojiString = interaction.options.getString('emoji');
            const customIcon = interaction.options.getAttachment('custom_icon');

            // Validate that at least one option was provided
            if (!newRoleColor && !emojiString && !customIcon) {
                return await interaction.editReply('You must provide at least one change (color, emoji, or custom icon).');
            }

            // Prepare update data
            const updateData = {};

            // Handle color if provided
            if (newRoleColor) {
                // Check if the color is a valid hex code
                const hexRegex = /^#?([0-9A-Fa-f]{6})$/;
                if (!hexRegex.test(newRoleColor)) {
                    return await interaction.editReply('Invalid color format. Please provide a valid hex color code (e.g., #FF5500 or FF5500).');
                }
                updateData.color = newRoleColor.replace('#', '');  // Remove # if present
            }

            // Handle icon (prioritize custom icon over emoji)
            if (customIcon) {
                // Check if the file is an image
                const validImageTypes = ['image/jpeg', 'image/png', 'image/gif'];
                if (!validImageTypes.includes(customIcon.contentType)) {
                    return await interaction.editReply('Invalid file type. Please upload a JPEG, PNG, or GIF image.');
                }

                // Check file size (Discord has a limit of approximately 256KB for role icons)
                if (customIcon.size > 256000) {
                    return await interaction.editReply('Image file is too large. Please upload an image smaller than 256KB.');
                }

                // Fetch the icon data
                const iconResponse = await fetch(customIcon.url);
                const iconBuffer = Buffer.from(await iconResponse.arrayBuffer());
                updateData.icon = iconBuffer;
            } else if (emojiString) {
                // Extract emoji ID from the string
                const emojiMatch = emojiString.match(/<:.*?:(\d+)>/);
                if (!emojiMatch) {
                    return await interaction.editReply('Invalid emoji format. Please use a server emoji by typing it directly or in the format `:emojiname:`.');
                }

                const emojiId = emojiMatch[1];
                const emoji = interaction.guild.emojis.cache.get(emojiId);

                if (!emoji) {
                    return await interaction.editReply('Emoji not found. Please use an emoji from this server.');
                }

                // Fetch the emoji image
                const emojiUrl = emoji.url;
                const emojiResponse = await fetch(emojiUrl);
                const emojiBuffer = Buffer.from(await emojiResponse.arrayBuffer());
                updateData.icon = emojiBuffer;
            }

            // Check if there are any updates to apply
            if (Object.keys(updateData).length === 0) {
                return await interaction.editReply('No valid changes were provided.');
            }

            // Update the role
            await role.edit(updateData);

            // Create success embed
            const embed = new EmbedBuilder()
                .setTitle('Pro Money Maker Role Updated')
                .setColor(newRoleColor ? `#${updateData.color}` : Colors.Green)
                .addFields({ name: 'Updated By', value: interaction.user.toString(), inline: true })
                .setTimestamp();

            // Add fields based on what was updated
            if (newRoleColor) {
                embed.addFields({ name: 'New Color', value: `#${updateData.color}`, inline: true });
            }
            if (customIcon || emojiString) {
                embed.addFields({ name: 'Icon Updated', value: '✅', inline: true });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            await interaction.editReply('An error occurred while updating the Pro Money Maker role. Please try again later.');
        }
    }
};