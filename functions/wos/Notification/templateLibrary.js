const {
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    ContainerBuilder,
    MessageFlags,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize
} = require('discord.js');
const { getUserInfo, assertUserMatches, handleError, hasPermission, updateComponentsV2AfterSeparator } = require('../utility/commonFunctions');
const { PERMISSIONS } = require('../Settings/admin/permissions');
const { getEmojiMapForUser, getComponentEmoji } = require('../utility/emojis');
const { checkFeatureAccess } = require('../utility/checkAccess');

/**
 * Create Template Library button
 */
function createTemplateLibraryButton(userId, lang) {
    return new ButtonBuilder()
        .setCustomId(`template_library_${userId}`)
        .setLabel(lang.notification.templateLibrary.buttons.templateLibrary)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(getComponentEmoji(getEmojiMapForUser(userId), '1044'));
}

/**
 * Handle Template Library button - shows share/upload options
 */
async function handleTemplateLibraryButton(interaction) {
    const { adminData, lang } = getUserInfo(interaction.user.id);

    try {
        const expectedUserId = interaction.customId.split('_')[2];
        if (!(await assertUserMatches(interaction, expectedUserId, lang))) return;

        // Check permissions
        const hasAccess = hasPermission(adminData, PERMISSIONS.FULL_ACCESS, PERMISSIONS.NOTIFICATIONS_MANAGEMENT);
        const hasPrivateFeature = checkFeatureAccess('privateNotifications', interaction);

        const hasPermissionToUse = hasAccess || hasPrivateFeature;

        // Show share and upload buttons
        const shareButton = new ButtonBuilder()
            .setCustomId(`template_share_${interaction.user.id}`)
            .setLabel(lang.notification.templateLibrary.buttons.shareNotification)
            .setStyle(ButtonStyle.Primary)
            .setEmoji(getComponentEmoji(getEmojiMapForUser(interaction.user.id), '1018'));

        const uploadButton = new ButtonBuilder()
            .setCustomId(`template_upload_${interaction.user.id}`)
            .setLabel(lang.notification.templateLibrary.buttons.uploadNotification)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(getComponentEmoji(getEmojiMapForUser(interaction.user.id), '1000'))
            .setDisabled(!hasPermissionToUse); 

        const buttonRow = new ActionRowBuilder().addComponents(shareButton, uploadButton);

        const container = [
            new ContainerBuilder()
                .setAccentColor(9807270) // purple
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `${lang.notification.templateLibrary.content.title}\n` +
                        `${lang.notification.templateLibrary.content.shareField.name}\n` +
                        `${lang.notification.templateLibrary.content.shareField.value}\n` +
                        `${lang.notification.templateLibrary.content.uploadField.name}\n` +
                        `${lang.notification.templateLibrary.content.uploadField.value}`
                    )
                )
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addActionRowComponents(buttonRow)
        ];

        const content = updateComponentsV2AfterSeparator(interaction, container);

        await interaction.update({
            components: content,
            flags: MessageFlags.IsComponentsV2
        });

    } catch (error) {
        await handleError(interaction, lang, error, 'handleTemplateLibraryButton');
    }
}

module.exports = {
    createTemplateLibraryButton,
    handleTemplateLibraryButton
};
