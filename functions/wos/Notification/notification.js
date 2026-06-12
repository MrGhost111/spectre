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
const { createBackToPanelButton } = require('../Panel/backToPanel');
const { createNotificationButton } = require('./createNotification');
const { createEditNotificationButton } = require('./editNotification');
const { createDeleteNotificationButton } = require('./deleteNotification');
const { createTemplateLibraryButton } = require('./templateLibrary');
const { createScheduleViewButton } = require('./scheduleView');
const { createAutoCleanButton } = require('./autoClean');
const { getUserInfo, assertUserMatches, handleError, hasPermission } = require('../utility/commonFunctions');
const { getEmojiMapForUser, getComponentEmoji } = require('../utility/emojis');
const { checkFeatureAccess } = require('../utility/checkAccess');
const { PERMISSIONS } = require('../Settings/admin/permissions');

/**
 * Creates a notification management button for the main panel
 * @param {string} userId - Discord user ID for button ownership
 * @param {Object} lang - Localization object
 * @returns {ButtonBuilder} Configured notification button
 */
function createNotificationManagementButton(userId, lang = {}) {
    return new ButtonBuilder()
        .setCustomId(`notification_management_${userId}`)
        .setLabel(lang.panel.mainPage.buttons.notification)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(getComponentEmoji(getEmojiMapForUser(userId), '1022'));
}

/**
 * Creates notification management embed and action components
 * @param {import('discord.js').Interaction} interaction - Discord interaction
 * @param {Object} lang - Localization object
 * @returns {Object} { components } for the notification panel
 */
function createNotificationContainer(interaction) {

    const { adminData, lang } = getUserInfo(interaction.user.id);

    const hasServerPermission = hasPermission(adminData, PERMISSIONS.FULL_ACCESS, PERMISSIONS.NOTIFICATIONS_MANAGEMENT);
    const hasPrivateFeature = checkFeatureAccess('privateNotifications', interaction);

    const returnedBackButton = createBackToPanelButton(interaction.user.id, lang);
    const createNotificationButtonInstance = createNotificationButton(interaction.user.id, lang);
    const editNotificationButtonInstance = createEditNotificationButton(interaction.user.id, lang);
    const deleteNotificationButtonInstance = createDeleteNotificationButton(interaction.user.id, lang);
    const templateLibraryButtonInstance = createTemplateLibraryButton(interaction.user.id, lang);
    const scheduleViewButtonInstance = createScheduleViewButton(interaction.user.id, lang);
    const autoCleanButtonInstance = createAutoCleanButton(interaction.user.id, lang);

    if (!hasServerPermission && !hasPrivateFeature) {
        createNotificationButtonInstance.setDisabled(true);
        editNotificationButtonInstance.setDisabled(true);
        deleteNotificationButtonInstance.setDisabled(true);
        scheduleViewButtonInstance.setDisabled(true);
        autoCleanButtonInstance.setDisabled(true);
    }


    const actionRow = new ActionRowBuilder()
        .addComponents(
            createNotificationButtonInstance,
            editNotificationButtonInstance,
            deleteNotificationButtonInstance,
            templateLibraryButtonInstance
        );

    const actionRow2 = new ActionRowBuilder()
        .addComponents(
            scheduleViewButtonInstance,
            autoCleanButtonInstance,
            returnedBackButton
        );

    const container = [
        new ContainerBuilder()
            .setAccentColor(2417109) // blue
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `${lang.notification.mainPage.content.title}\n` +
                    `${lang.notification.mainPage.content.description}\n` +

                    `${lang.notification.mainPage.content.createNotificationField.name}\n` +
                    `${lang.notification.mainPage.content.createNotificationField.value}\n` +

                    `${lang.notification.mainPage.content.updateNotificationField.name}\n` +
                    `${lang.notification.mainPage.content.updateNotificationField.value}\n` +

                    `${lang.notification.mainPage.content.deleteNotificationField.name}\n` +
                    `${lang.notification.mainPage.content.deleteNotificationField.value}\n` +

                    `${lang.notification.mainPage.content.templateLibraryField.name}\n` +
                    `${lang.notification.mainPage.content.templateLibraryField.value}\n` +

                    `${lang.notification.mainPage.content.scheduleViewField.name}\n` +
                    `${lang.notification.mainPage.content.scheduleViewField.value}\n` +

                    `${lang.notification.mainPage.content.autoCleanField.name}\n` +
                    `${lang.notification.mainPage.content.autoCleanField.value}\n`
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            )
            .addActionRowComponents(
                actionRow,
                actionRow2
            )
    ];

    return { components: container };
}

/**
 * Handles notification management button click - displays notification panel
 * @param {import('discord.js').ButtonInteraction} interaction 
 */
async function handleNotificationManagementButton(interaction) {
    const { lang } = getUserInfo(interaction.user.id);

    try {
        const expectedUserId = interaction.customId.split('_')[2];
        if (!(await assertUserMatches(interaction, expectedUserId, lang))) return;

        const { components } = createNotificationContainer(interaction, lang);

        await interaction.update({
            components: components,
            flags: MessageFlags.IsComponentsV2
        });

    } catch (error) {
        await handleError(interaction, lang, error, 'handleNotificationManagementButton');
    }
}

module.exports = {
    createNotificationManagementButton,
    handleNotificationManagementButton,
    createNotificationContainer
};
