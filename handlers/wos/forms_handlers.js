const createAlliance = require('../functions/wos/Alliance/createAlliance');
const editAlliance = require('../functions/wos/Alliance/editAlliance');
const editPriority = require('../functions/wos/Alliance/editPriority');
const addPlayer = require('../functions/wos/Players/addPlayer');
const movePlayers = require('../functions/wos/Players/movePlayers');
const removePlayers = require('../functions/wos/Players/removePlayers');
const history = require('../functions/wos/Players/history');
const idChannel = require('../functions/wos/Players/idChannel');
const giftSetTestId = require('../functions/wos/GiftCode/setTestId');
const addGift = require('../functions/wos/GiftCode/addGift');
const createNotification = require('../functions/wos/Notification/createNotification');
const editNotification = require('../functions/wos/Notification/editNotification');
const notificationEditor = require('../functions/wos/Notification/notificationEditor');
const notificationFields = require('../functions/wos/Notification/notificationFields');
const notificationSettings = require('../functions/wos/Notification/notificationSettings');
const uploadNotification = require('../functions/wos/Notification/uploadNotification');
const notifAutoClean = require('../functions/wos/Notification/autoClean');
const emojisCreate = require('../functions/wos/Settings/theme/emojisCreate');
const emojisEditor = require('../functions/wos/Settings/theme/emojisEditor');
const emojisUpload = require('../functions/wos/Settings/theme/emojisImport');
const dbMigration = require('../functions/wos/Settings/migration');
const backUpCreate = require('../functions/wos/Settings/backup/backupCreate');
const buildings = require('../functions/wos/Calculators/Buildings/buildings');
const warAcademy = require('../functions/wos/Calculators/WarAcademy/warAcademy');

// === HANDLER REGISTRY ===
const formHandlers = [
    // Alliance modals
    { pattern: /^create_alliance_modal_/, fn: createAlliance.handleCreateAllianceModal },
    { pattern: /^edit_alliance_modal_/, fn: editAlliance.handleEditAllianceModal },
    { pattern: /^priority_custom_modal_/, fn: editPriority.handlePriorityCustomModal },

    // Player modals
    { pattern: /^player_id_modal_/, fn: addPlayer.handlePlayerIdModal },
    { pattern: /^move_players_ids_modal_/, fn: movePlayers.handleMovePlayersIdsModal },
    { pattern: /^remove_players_ids_modal_/, fn: removePlayers.handleRemovePlayersIdsModal },

    // Player history search modal
    { pattern: /^history_search_modal_/, fn: history.handleHistorySearchModal },

    // ID Channel auto-clean modal
    { pattern: /^id_channel_autoclean_modal_/, fn: idChannel.handleAutoCleanModal },

    // Gift Code modals
    { pattern: /^test_id_modal_/, fn: giftSetTestId.handleTestIdModal },
    { pattern: /^add_gift_modal_/, fn: addGift.handleGiftCodeModal },

    // Notification modals
    { pattern: /^notification_create_/, fn: createNotification.handleCreateNotificationModal },
    { pattern: /^notification_update_message_/, fn: notificationEditor.handleUpdateMessageModal },
    { pattern: /^notification_update_embed_/, fn: notificationEditor.handleUpdateEmbedComponentModal },
    { pattern: /^notification_field_add_modal_/, fn: notificationFields.handleAddFieldModal },
    { pattern: /^notification_field_edit_modal_/, fn: notificationFields.handleEditFieldModal },
    { pattern: /^notification_pattern_custom_modal_/, fn: notificationSettings.handleCustomPatternModal },
    { pattern: /^notification_repeat_custom_modal_/, fn: notificationSettings.handleCustomRepeatModal },
    { pattern: /^notification_update_time_modal_/, fn: notificationSettings.handleUpdateTimeModal },
    { pattern: /^notification_edit_info_modal_/, fn: editNotification.handleInfoModal },
    { pattern: /^template_upload_file_modal_/, fn: uploadNotification.handleFileUploadModalSubmit },
    { pattern: /^template_import_modal_/, fn: uploadNotification.handleImportModalSubmit },
    { pattern: /^notif_ac_freq_modal_/, fn: notifAutoClean.handleAutoCleanFreqModal },
    { pattern: /^emoji_create_modal_/, fn: emojisCreate.handleEmojiCreateModal },
    { pattern: /^emoji_editor_modal_/, fn: emojisEditor.handleEmojiEditorModal },
    { pattern: /^emoji_upload_modal_/, fn: emojisUpload.handleEmojiUploadModal },
    { pattern: /^emoji_upload_rename_modal_/, fn: emojisUpload.handleEmojiUploadRenameModal },
    { pattern: /^db_migration_modal_/, fn: dbMigration.handleDBMigrationModal },
    { pattern: /^db_backup_oauth_modal_/, fn: backUpCreate.handleOAuthModal },
    { pattern: /^db_backup_oauth_code_modal_/, fn: backUpCreate.handleOAuthCodeModal },

    // Calculators
    { pattern: /^calc_buffs_modal_/, fn: buildings.handleBuildingBuffsModal },
    { pattern: /^calc_bld_rmmodal_/, fn: buildings.handleRemoveModal },
    { pattern: /^calc_wa_modal_/, fn: warAcademy.handleBuffsModal },
    { pattern: /^calc_wa_rmmodal_/, fn: warAcademy.handleRemoveModal }
];

// === SETUP FUNCTION ===
/**
 * Handles all modal form (ModalSubmit) interactions
 * @param {import('discord.js').Client} client - Discord client instance
 */
function setupFormHandlers(client) {
    const listener = async (interaction) => {
        if (!interaction.isModalSubmit()) return;

        for (const { pattern, fn } of formHandlers) {
            if (pattern.test(interaction.customId)) {
                try {
                    await fn(interaction);
                } catch (error) {
                    console.error(`[FormHandler] Error handling form ${interaction.customId}:`, error);
                    try {
                        const reply = interaction.deferred || interaction.replied
                            ? interaction.followUp.bind(interaction)
                            : interaction.reply.bind(interaction);
                        await reply({ content: 'An error occurred while processing this form.', flags: 64 });
                    } catch (_) { /* interaction may have expired */ }
                }
                return; // stop after first match
            }
        }
    };

    client.on('interactionCreate', listener);

    return () => client.off('interactionCreate', listener);
}

module.exports = setupFormHandlers;
