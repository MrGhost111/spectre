const { ButtonBuilder, ButtonStyle, ActionRowBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, ChannelSelectMenuBuilder, StringSelectMenuBuilder } = require('discord.js');
const { getComponentEmoji, getEmojiMapForUser } = require('../utility/emojis');
const { createBackToSettingsButton } = require('./backToSettings');
const { settingsQueries, notificationQueries, adminQueries } = require('../utility/database');
const { getUserInfo, assertUserMatches, handleError, hasPermission, updateComponentsV2AfterSeparator } = require('../utility/commonFunctions');
const { FEATURE_ACCESS } = require('../utility/checkAccess');

/**
 * Create a "Features Access" settings button
 * @param {string} userId - ID of the user who can interact with this button
 * @param {Object} lang  - Language object for localized text
 * @returns {ButtonBuilder} The feature access button
 */
function createFeatureAccessButton(userId, lang = {}) {
    return new ButtonBuilder()
        .setCustomId(`feature_access_${userId}`)
        .setLabel(lang.settings.mainPage.buttons.featureAccess)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(getComponentEmoji(getEmojiMapForUser(userId), '1011'));
}

/**
 * Handle feature access button - show current JSON and provide back button
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleFeatureAccessButton(interaction) {
    const { adminData, lang } = getUserInfo(interaction.user.id);
    try {
        const expectedUserId = interaction.customId.split('_')[2]; // feature_access_userId
        if (!(await assertUserMatches(interaction, expectedUserId, lang))) return;

        const fullAccess = hasPermission(adminData);

        // Only owner can edit feature access
        if (!fullAccess) {
            return await interaction.reply({ content: lang.common.noPermission, ephemeral: true });
        }

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`feature_access_feat_privateNotifications_${interaction.user.id}`)
                .setLabel(lang.settings.featureAccess.buttons.privateNotifications)
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(getComponentEmoji(getEmojiMapForUser(interaction.user.id), '1022')),
            new ButtonBuilder()
                .setCustomId(`feature_access_feat_calculators_${interaction.user.id}`)
                .setLabel(lang.settings.featureAccess.buttons.calculators)
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(getComponentEmoji(getEmojiMapForUser(interaction.user.id), '1041')),
            new ButtonBuilder()
                .setCustomId(`feature_access_feat_inspect_${interaction.user.id}`)
                .setLabel(lang.settings.featureAccess.buttons.inspect)
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(getComponentEmoji(getEmojiMapForUser(interaction.user.id), '1026')),
            new ButtonBuilder()
                .setCustomId(`feature_access_whitelist_${interaction.user.id}`)
                .setLabel(lang.settings.featureAccess.buttons.whitelistChannels)
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(getComponentEmoji(getEmojiMapForUser(interaction.user.id), '1014')),
            createBackToSettingsButton(interaction.user.id, lang)
        );

        const container = new ContainerBuilder()
            .setAccentColor(0x9b59b6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `${lang.settings.featureAccess.content.title.base}\n` +
                    `${lang.settings.featureAccess.content.description.base}\n`
                )
            )
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addActionRowComponents(
                actionRow
            );

        await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });

    } catch (error) {
        await handleError(interaction, lang, error, 'handleFeatureAccessButton');
    }
}


/**
 * Handle clicks on per-feature buttons (e.g., privateNotifications, calculators)
 * Shows four access option buttons using Components V2 below the separator
 */
async function handleFeatureAccessFeatureButton(interaction) {
    const { adminData, lang } = getUserInfo(interaction.user.id);
    try {
        // expected format: feature_access_feat_{featureKey}_{userId}
        const parts = interaction.customId.split('_');
        const featIndex = parts.indexOf('feat');
        const featureKey = parts[featIndex + 1];
        const expectedUserId = parts[parts.length - 1];

        if (!(await assertUserMatches(interaction, expectedUserId, lang))) return;

        // Only owners / full access can modify
        const isOwnerOrFull = hasPermission(adminData);
        if (!isOwnerOrFull) {
            return await interaction.reply({ content: lang.common.noPermission, ephemeral: true });
        }

        // Load current feature_access JSON
        const row = settingsQueries.getFeatureAccess.get();
        let parsed = {};
        try { parsed = JSON.parse(row?.feature_access || '{}'); } catch (e) { parsed = {}; }

        // Ensure feature key exists
        if (!parsed[featureKey] || typeof parsed[featureKey] !== 'object') {
            parsed[featureKey] = { access: FEATURE_ACCESS.EVERYONE };
            settingsQueries.setFeatureAccess.run(JSON.stringify(parsed)); 
        }

        const currentAccess = Number(parsed[featureKey].access) || FEATURE_ACCESS.EVERYONE;

        // Build action row with four access buttons
        const everyoneBtn = new ButtonBuilder()
            .setCustomId(`feature_access_set_${featureKey}_${FEATURE_ACCESS.EVERYONE}_${expectedUserId}`)
            .setLabel(lang.settings.featureAccess.buttons.everyone)
            .setStyle(currentAccess === FEATURE_ACCESS.EVERYONE ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setEmoji(getComponentEmoji(getEmojiMapForUser(interaction.user.id), '1018'));

        const adminsBtn = new ButtonBuilder()
            .setCustomId(`feature_access_set_${featureKey}_${FEATURE_ACCESS.ADMINS_ONLY}_${expectedUserId}`)
            .setLabel(lang.settings.featureAccess.buttons.admins)
            .setStyle(currentAccess === FEATURE_ACCESS.ADMINS_ONLY ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setEmoji(getComponentEmoji(getEmojiMapForUser(interaction.user.id), '1027'));

        const byChannelBtn = new ButtonBuilder()
            .setCustomId(`feature_access_set_${featureKey}_${FEATURE_ACCESS.BY_CHANNEL}_${expectedUserId}`)
            .setLabel(lang.settings.featureAccess.buttons.channel)
            .setStyle(currentAccess === FEATURE_ACCESS.BY_CHANNEL ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setEmoji(getComponentEmoji(getEmojiMapForUser(interaction.user.id), '1029'));

        const noOneBtn = new ButtonBuilder()
            .setCustomId(`feature_access_set_${featureKey}_${FEATURE_ACCESS.NO_ONE}_${expectedUserId}`)
            .setLabel(lang.settings.featureAccess.buttons.disable)
            .setStyle(currentAccess === FEATURE_ACCESS.NO_ONE ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setEmoji(getComponentEmoji(getEmojiMapForUser(interaction.user.id), '1051'));

        const actionRow = new ActionRowBuilder().addComponents(everyoneBtn, adminsBtn, byChannelBtn, noOneBtn);

        const featureNameDisplay = lang.settings.featureAccess.content?.[featureKey];

        const container = [
            new ContainerBuilder()
                .setAccentColor(0x9b59b6)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `${lang.settings.featureAccess.content.title.selectAccess.replace('{featureName}', featureNameDisplay)}\n` +
                    lang.settings.featureAccess.content.description.selectAccess
                ))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addActionRowComponents(actionRow)
        ];

        const content = updateComponentsV2AfterSeparator(interaction, container);
        await interaction.update({ components: content, flags: MessageFlags.IsComponentsV2 });

    } catch (error) {
        await handleError(interaction, lang, error, 'handleFeatureAccessFeatureButton');
    }
}

/**
 * Handle setting the access value for a feature
 * customId: feature_access_set_{featureKey}_{accessBit}_{userId}
 */
async function handleSetFeatureAccess(interaction) {
    const { adminData, lang } = getUserInfo(interaction.user.id);

    try {
        const parts = interaction.customId.split('_');
        const setIndex = parts.indexOf('set');
        const featureKey = parts[setIndex + 1];
        const accessBit = Number(parts[setIndex + 2]); 
        const expectedUserId = parts[parts.length - 1];

        if (!(await assertUserMatches(interaction, expectedUserId, lang))) return;

        // Only owner / full access can change
        const isOwnerOrFull = hasPermission(adminData);
        if (!isOwnerOrFull) {
            return await interaction.reply({ content: lang.common.noPermission, ephemeral: true });
        }

        // Special handling for privateNotifications - show confirmation if restricting access
        if (featureKey === 'privateNotifications' && accessBit !== FEATURE_ACCESS.EVERYONE) {
            return await showPrivateNotificationsConfirmation(interaction, featureKey, accessBit, expectedUserId, lang);
        }

        // Load and update
        const row = settingsQueries.getFeatureAccess.get();
        let parsed = {};
        parsed = JSON.parse(row?.feature_access || '{}');

        if (!parsed[featureKey] || typeof parsed[featureKey] !== 'object') parsed[featureKey] = {};
        parsed[featureKey].access = Number(accessBit);

        // Persist access change
        settingsQueries.setFeatureAccess.run(JSON.stringify(parsed));

        const confirmation = new ContainerBuilder()
            .setAccentColor(0x2ecc71)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(lang.settings.featureAccess.content.updated));

        const content = updateComponentsV2AfterSeparator(interaction, [confirmation]);
        await interaction.update({ components: content, flags: MessageFlags.IsComponentsV2 });

    } catch (error) {
        await handleError(interaction, lang, error, 'handleSetFeatureAccess');
    }
}

/**
 * Handle opening the whitelist channels panel
 */
async function handleWhitelistChannelsButton(interaction) {
    const { adminData, lang } = getUserInfo(interaction.user.id);
    try {
        const parts = interaction.customId.split('_');
        const expectedUserId = parts[parts.length - 1]; // feature_access_whitelist_{userId}
        if (!(await assertUserMatches(interaction, expectedUserId, lang))) return;

        const isOwnerOrFull = hasPermission(adminData);
        if (!isOwnerOrFull) return await interaction.reply({ content: lang.common.noPermission, ephemeral: true });

        const row = settingsQueries.getFeatureAccess.get();
        let parsed = {};
        parsed = JSON.parse(row?.feature_access || '{}'); 

        const whitelist = Array.isArray(parsed.whitelisted_channels) ? parsed.whitelisted_channels : [];
        const display = whitelist.length > 0 ? whitelist.map(id => `- <#${id}>`).join('\n') : lang.settings.featureAccess.content.noWhitelistedChannels;

        const addBtn = new ButtonBuilder()
            .setCustomId(`feature_access_whitelist_add_${expectedUserId}`)
            .setLabel(lang.settings.featureAccess.buttons.add)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(getComponentEmoji(getEmojiMapForUser(interaction.user.id), '1000'));

        const removeBtn = new ButtonBuilder()
            .setCustomId(`feature_access_whitelist_remove_${expectedUserId}`)
            .setLabel(lang.settings.featureAccess.buttons.remove)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(getComponentEmoji(getEmojiMapForUser(interaction.user.id), '1031'));

        const actionRow = new ActionRowBuilder().addComponents(addBtn, removeBtn);

        const container = [
            new ContainerBuilder()
                .setAccentColor(0x9b59b6)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `${lang.settings.featureAccess.content.title.whitelistedChannels}\n` +
                    lang.settings.featureAccess.content.description.chooseAction
                ))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addActionRowComponents(actionRow)
        ];

        const content = updateComponentsV2AfterSeparator(interaction, container);
        await interaction.update({ components: content, flags: MessageFlags.IsComponentsV2 });

    } catch (error) {
        await handleError(interaction, lang, error, 'handleWhitelistChannelsButton');
    }
}


/**
 * Show channel select to add channels to the whitelist
 */
async function handleWhitelistAddButton(interaction) {
    const { adminData, lang } = getUserInfo(interaction.user.id);

    try {
        const parts = interaction.customId.split('_');
        const expectedUserId = parts[parts.length - 1];
        if (!(await assertUserMatches(interaction, expectedUserId, lang))) return;

        if (!interaction.guild) {
            return await interaction.reply({ content: lang.settings.featureAccess.errors.notServer, ephemeral: true });
        }

        const isOwnerOrFull = hasPermission(adminData);
        if (!isOwnerOrFull) return await interaction.reply({ content: lang.common.noPermission, ephemeral: true });

        const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId(`feature_access_whitelist_select_add_${expectedUserId}`)
            .setPlaceholder(lang.settings.featureAccess.selectmenu.channelAdd.placeholder)
            .setMinValues(1)
            .setMaxValues(25);

        const selectRow = new ActionRowBuilder().addComponents(channelSelect);

        const container = [
            new ContainerBuilder()
                .setAccentColor(0x9b59b6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `${lang.settings.featureAccess.content.title.ChannelSelect}\n`+
                        lang.settings.featureAccess.content.description.chooseChannelsToAdd
                    )
                )
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addActionRowComponents(selectRow)
        ];

        const content = updateComponentsV2AfterSeparator(interaction, container);
        await interaction.update({ components: content, flags: MessageFlags.IsComponentsV2 });

    } catch (error) {
        await handleError(interaction, lang, error, 'handleWhitelistAddButton');
    }
}


/**
 * Show channel select to remove channels from the whitelist
 */
async function handleWhitelistRemoveButton(interaction) {
    const { adminData, lang } = getUserInfo(interaction.user.id);

    try {
        const parts = interaction.customId.split('_');
        const expectedUserId = parts[parts.length - 1];
        if (!(await assertUserMatches(interaction, expectedUserId, lang))) return;

        const isOwnerOrFull = hasPermission(adminData);
        if (!isOwnerOrFull) return await interaction.reply({ content: lang.common.noPermission, ephemeral: true });

        // Read current whitelist and build options for channels present in this guild
        const row = settingsQueries.getFeatureAccess.get();
        let parsed = {};
        try { parsed = JSON.parse(row?.feature_access || '{}'); } catch (e) { parsed = {}; }

        const whitelist = Array.isArray(parsed.whitelisted_channels) ? parsed.whitelisted_channels : [];

        if (!interaction.guild) {
            return await interaction.reply({ content: lang.settings.featureAccess.errors.notServer, ephemeral: true });
        }

        // Find channels in this guild that are whitelisted
        const guildChannels = Array.from(interaction.guild.channels.cache.values())
            .filter(ch => whitelist.includes(ch.id));

        if (guildChannels.length === 0) {
            return await interaction.reply({ content: lang.settings.featureAccess.content.noWhitelistedChannels, ephemeral: true });
        }

        const options = guildChannels.map(ch => ({ label: ch.name || ch.id, value: ch.id }));

        const select = new StringSelectMenuBuilder()
            .setCustomId(`feature_access_whitelist_select_remove_${expectedUserId}`)
            .setPlaceholder(lang.settings.featureAccess.selectmenu.channelRemove.placeholder)
            .setMinValues(1)
            .setMaxValues(Math.min(25, options.length))
            .addOptions(options);

        const selectRow = new ActionRowBuilder().addComponents(select);

        const container = [
            new ContainerBuilder()
                .setAccentColor(0x9b59b6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `${lang.settings.featureAccess.content.title.ChannelSelect}\n` +
                        lang.settings.featureAccess.content.description.chooseChannelsToRemove
                    )
                )
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addActionRowComponents(
                    selectRow
                )
        ];

        const content = updateComponentsV2AfterSeparator(interaction, container);
        await interaction.update({ components: content, flags: MessageFlags.IsComponentsV2 });

    } catch (error) {
        await handleError(interaction, lang, error, 'handleWhitelistRemoveButton');
    }
}


/**
 * Handle channel select results for whitelist add/remove
 */
async function handleWhitelistSelect(interaction) {
    const { adminData, lang } = getUserInfo(interaction.user.id);

    try {
        const parts = interaction.customId.split('_');
        // expected: feature_access_whitelist_select_{add|remove}_{userId}
        const action = parts[4];
        const expectedUserId = parts[5];
        if (!(await assertUserMatches(interaction, expectedUserId, lang))) return;

        const row = settingsQueries.getFeatureAccess.get();
        let parsed = {};
        try { parsed = JSON.parse(row?.feature_access || '{}'); } catch (e) { parsed = {}; }

        if (!Array.isArray(parsed.whitelisted_channels)) parsed.whitelisted_channels = [];

        const selected = Array.isArray(interaction.values) ? interaction.values : [];

        let changedChannels = [];
        if (action === 'add') {
            for (const ch of selected) {
                if (!parsed.whitelisted_channels.includes(ch)) {
                    parsed.whitelisted_channels.push(ch);
                    changedChannels.push(ch);
                }
            }
        } else if (action === 'remove') {
            changedChannels = parsed.whitelisted_channels.filter(ch => selected.includes(ch));
            parsed.whitelisted_channels = parsed.whitelisted_channels.filter(ch => !selected.includes(ch));
        }

        settingsQueries.setFeatureAccess.run(JSON.stringify(parsed));

        let summary = '';
        let description = '';
        if (changedChannels.length > 0) {
            summary = changedChannels.map(id => `- <#${id}>`).join('\n');
            if (action === 'add') {
                description = lang.settings.featureAccess.content.description.channelsAdded;
            } else if (action === 'remove') {
                description = lang.settings.featureAccess.content.description.channelsRemoved;
            }
        } else {
            summary = lang.settings.featureAccess.errors.alreadyExisits;
            description = '';
        }

        const confirmation = new ContainerBuilder()
            .setAccentColor(0x2ecc71)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `${lang.settings.featureAccess.content.title.whitelistedChannels}\n` +
                    (description ? description.replace('{channelsList}', summary) : summary)
                )
            );

        const content = updateComponentsV2AfterSeparator(interaction, [confirmation]);
        await interaction.update({ components: content, flags: MessageFlags.IsComponentsV2 });

    } catch (error) {
        await handleError(interaction, lang, error, 'handleWhitelistSelect');
    }
}

/**
 * Show confirmation dialog before changing private notifications access
 */
async function showPrivateNotificationsConfirmation(interaction, featureKey, accessBit, userId, lang) {
    try {
        // Get owner admin data
        const ownerAdmin = adminQueries.getAllAdmins().find(a => a.is_owner === 1);
        if (!ownerAdmin) {
            return await interaction.reply({ content: lang.common.error, ephemeral: true });
        }

        // Determine which users to exclude based on access type
        let excludedUserIds = [ownerAdmin.user_id]; // Always exclude owner
        
        if (accessBit === FEATURE_ACCESS.ADMINS_ONLY) {
            // For ADMINS_ONLY, also exclude all admins
            const allAdmins = adminQueries.getAllAdmins();
            excludedUserIds = allAdmins.map(a => a.user_id);
        }
        // For BY_CHANNEL, NO_ONE: only owner is excluded (owner can still manage)

        // Count affected notifications
        const affectedNotifications = notificationQueries.getActivePrivateNotificationsExcludingUsers(excludedUserIds);
        const affectedCount = affectedNotifications.length;

        // Determine description based on access type
        let descriptionKey = 'everyone';
        if (accessBit === FEATURE_ACCESS.ADMINS_ONLY) descriptionKey = 'admins';
        else if (accessBit === FEATURE_ACCESS.BY_CHANNEL) descriptionKey = 'channel';
        else if (accessBit === FEATURE_ACCESS.NO_ONE) descriptionKey = 'disable';

        const description = lang.settings.featureAccess.content.description[descriptionKey];
        const affectedInfo = affectedCount > 0 
            ? lang.settings.featureAccess.content.affectedNotifications.replace('{count}', affectedCount)
            : lang.settings.featureAccess.content.noAffectedNotifications;

        // Build confirmation buttons
        const confirmBtn = new ButtonBuilder()
            .setCustomId(`feature_access_privateNotifications_confirm_${featureKey}_${accessBit}_${userId}`)
            .setLabel(lang.settings.featureAccess.buttons.confirm)
            .setStyle(ButtonStyle.Danger)
            .setEmoji(getComponentEmoji(getEmojiMapForUser(userId), '1004'));

        const cancelBtn = new ButtonBuilder()
            .setCustomId(`feature_access_privateNotifications_cancel_${userId}`)
            .setLabel(lang.settings.featureAccess.buttons.cancel)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(getComponentEmoji(getEmojiMapForUser(userId), '1051'));

        const actionRow = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

        const container = [
            new ContainerBuilder()
                .setAccentColor(0xe67e22)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `${lang.settings.featureAccess.content.title.confirmation}\n${description}${affectedInfo}`
                    )
                )
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addActionRowComponents(actionRow)
        ];

        const content = updateComponentsV2AfterSeparator(interaction, container);
        await interaction.update({ components: content, flags: MessageFlags.IsComponentsV2 });

    } catch (error) {
        await handleError(interaction, lang, error, 'showPrivateNotificationsConfirmation');
    }
}

/**
 * Handle confirmation/cancellation for private notifications access change
 * customId patterns:
 * - feature_access_privateNotifications_confirm_{featureKey}_{accessBit}_{userId}
 * - feature_access_privateNotifications_cancel_{userId}
 */
async function handlePrivateNotificationsConfirmCancel(interaction) {
    const { adminData, lang } = getUserInfo(interaction.user.id);

    try {
        const parts = interaction.customId.split('_');
        const action = parts[3]; // confirm or cancel
        const expectedUserId = parts[parts.length - 1];

        if (!(await assertUserMatches(interaction, expectedUserId, lang))) return;

        const isOwnerOrFull = hasPermission(adminData);
        if (!isOwnerOrFull) {
            return await interaction.reply({ content: lang.common.noPermission, ephemeral: true });
        }

        if (action === 'cancel') {
            // Just show updated message without making changes
            const container = new ContainerBuilder()
                .setAccentColor(0x95a5a6)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('Access change cancelled.'));

            const content = updateComponentsV2AfterSeparator(interaction, [container]);
            return await interaction.update({ components: content, flags: MessageFlags.IsComponentsV2 });
        }

        const featureKey = parts[4];
        const accessBit = Number(parts[5]);

        // Update access setting
        const row = settingsQueries.getFeatureAccess.get();
        let parsed = {};
        try { parsed = JSON.parse(row?.feature_access || '{}'); } catch (e) { parsed = {}; }

        if (!parsed[featureKey] || typeof parsed[featureKey] !== 'object') parsed[featureKey] = {};
        parsed[featureKey].access = Number(accessBit);
        settingsQueries.setFeatureAccess.run(JSON.stringify(parsed));

        let affectedInfo = '';

        // If confirm, deactivate affected notifications
        if (action === 'confirm') {
            // Get owner
            const ownerAdmin = adminQueries.getAllAdmins().find(a => a.is_owner === 1);
            if (!ownerAdmin) {
                return await interaction.reply({ content: lang.common.error, ephemeral: true });
            }

            // Determine excluded users based on access type
            let excludedUserIds = [ownerAdmin.user_id];
            
            if (accessBit === FEATURE_ACCESS.ADMINS_ONLY) {
                const allAdmins = adminQueries.getAllAdmins();
                excludedUserIds = allAdmins.map(a => a.user_id);
            }

            // Get affected notifications
            const affectedNotifications = notificationQueries.getActivePrivateNotificationsExcludingUsers(excludedUserIds);

            // Deactivate each notification and remove from scheduler
            const { notificationScheduler } = require('../Notification/notificationScheduler');
            
            for (const notification of affectedNotifications) {
                // Update notification: set is_active=false, next_trigger=null
                notificationQueries.updateNotification(
                    notification.id,
                    notification.name,
                    notification.guild_id,
                    notification.channel_id,
                    notification.hour,
                    notification.minute,
                    notification.message_content,
                    notification.title,
                    notification.description,
                    notification.color,
                    notification.image_url,
                    notification.thumbnail_url,
                    notification.footer,
                    notification.author,
                    notification.fields,
                    notification.pattern,
                    notification.mention,
                    notification.repeat_status,
                    notification.repeat_frequency,
                    notification.embed_toggle,
                    false, // is_active = false
                    notification.last_trigger,
                    0 // next_trigger = 0
                );

                // Remove from scheduler
                notificationScheduler.removeNotification(notification.id);
            }

            affectedInfo = affectedNotifications.length > 0
                ? lang.settings.featureAccess.content.notificationsDeactivated.replace('{count}', affectedNotifications.length)
                : lang.settings.featureAccess.content.noNotificationsDeactivated;
        }

        const finalMessage = lang.settings.featureAccess.content.changeApplied.replace('{affectedInfo}', affectedInfo);

        const container = new ContainerBuilder()
            .setAccentColor(0x2ecc71)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(finalMessage));

        const content = updateComponentsV2AfterSeparator(interaction, [container]);
        await interaction.update({ components: content, flags: MessageFlags.IsComponentsV2 });

    } catch (error) {
        await handleError(interaction, lang, error, 'handlePrivateNotificationsConfirmCancel');
    }
}

module.exports = {
    createFeatureAccessButton,
    handleFeatureAccessButton,
    handleFeatureAccessFeatureButton,
    handleSetFeatureAccess,
    handleWhitelistChannelsButton,
    handleWhitelistAddButton,
    handleWhitelistRemoveButton,
    handleWhitelistSelect,
    handlePrivateNotificationsConfirmCancel
};
