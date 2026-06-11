const { Events } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: false,
    async execute(client) {
        console.log('[WOS] Initializing WOS systems...');

        // Register the handler listeners on the client
        try {
            const setupButtonHandlers = require('../handlers/wos/buttons_handler');
            const setupDropdownHandlers = require('../handlers/wos/dropmenu_handlers');
            const setupFormHandlers = require('../handlers/wos/forms_handlers');
            setupButtonHandlers(client);
            setupDropdownHandlers(client);
            setupFormHandlers(client);
            console.log('[WOS] Button/dropdown/form handlers registered.');
        } catch (e) {
            console.error('[WOS] Failed to register handlers:', e.message);
        }

        // Core system inits (no Notification)
        const inits = [
            ['GiftCode API', () => require('../functions/wos/GiftCode/fetchGift').initializeGiftCodeAPI(client)],
            ['Alliance auto-refresh', () => require('../functions/wos/Alliance/refreshAlliance').initializeAutoRefresh(client)],
            ['Process recovery', () => require('../functions/wos/Processes/processRecovery').processRecovery.initialize(client)],
            ['Backup scheduler', () => require('../functions/wos/Settings/backup/backupScheduler').initializeBackupScheduler(client)],
            ['ID channel cache', () => require('../functions/wos/Players/idChannel').initializeIdChannelCache()],
            ['GiftCode channel cache', () => require('../functions/wos/GiftCode/giftCodeChannel').initializeGiftCodeChannelCache()],
            ['Auto-clean scheduler', () => require('../functions/wos/Players/idChannelAutoClean').autoCleanScheduler.initialize(client)],
            ['Admin username cache', () => require('../functions/wos/utility/adminUsernameCache').adminUsernameCache.initialize(client)],
            ['Emoji packs', () => require('../functions/wos/Settings/theme/emojisUploader').initializeEmojiPacks(client)],
            ['Player API availability', () => require('../functions/wos/utility/apiClient').playerApiManager.checkAvailability()],
        ];

        // DB cleanup on startup
        try {
            const { processQueries, systemLogQueries } = require('../functions/wos/utility/database');
            processQueries.cleanupCompletedFailedProcesses();
            const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
            const cutoff = new Date(Date.now() - ONE_WEEK_MS).toISOString();
            systemLogQueries.deleteLogsOlderThan(cutoff);
        } catch (e) {
            console.error('[WOS] DB cleanup error:', e.message);
        }

        // Run all inits non-blocking
        setImmediate(() => {
            for (const [label, runTask] of inits) {
                Promise.resolve()
                    .then(runTask)
                    .catch(err => console.error(`[WOS] Failed to initialize ${label}:`, err.message));
            }
        });

        console.log('[WOS] WOS systems startup complete.');
    }
};