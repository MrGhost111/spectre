const { adminQueries, settingsQueries } = require('./database');
const { handleError } = require('./commonFunctions');

// Feature access bit flags (shared source for modules)
const FEATURE_ACCESS = {
    EVERYONE: 1 << 0,    // 1
    ADMINS_ONLY: 1 << 1, // 2
    BY_CHANNEL: 1 << 2,  // 4
    NO_ONE: 1 << 3       // 8
};

/**
 * Check whether a feature is accessible for a given user/channel based on settings.feature_access JSON.
 * @param {string} featureName - Key in feature_access JSON (e.g., 'privateNotification')
 * @param {import('discord.js').Interaction} interaction - Discord interaction object
 * @returns {boolean} True if allowed, false otherwise
 */
function checkFeatureAccess(featureName, interaction) {
    try {
        const userId = interaction.user.id;
        const channelId = interaction.channelId;

        // Owner always has access
        if (adminQueries.isOwner(userId)) return true;

        const row = settingsQueries.getFeatureAccess.get();
        const jsonStr = row?.feature_access || '{}';
        let parsed = {};
        try {
            parsed = JSON.parse(jsonStr || '{}');
        } catch (e) {
            parsed = {};
        }

        // If empty config -> everyone allowed
        if (!parsed || Object.keys(parsed).length === 0) return true;

        const featureCfg = parsed[featureName];
        // Default to everyone if feature not configured
        if (!featureCfg || typeof featureCfg !== 'object') return true;

        const access = Number(featureCfg.access) || FEATURE_ACCESS.EVERYONE;

        // NO_ONE: disallow everything
        if (access & FEATURE_ACCESS.NO_ONE) return false;

        // EVERYONE: allow
        if (access & FEATURE_ACCESS.EVERYONE) return true;

        // ADMINS_ONLY: allow if user exists in admins table
        if (access & FEATURE_ACCESS.ADMINS_ONLY) {
            const admin = adminQueries.getAdmin(userId);
            return !!admin;
        }

        // BY_CHANNEL: allow only if channel is in the global whitelist (`whitelisted_channels`)
        if (access & FEATURE_ACCESS.BY_CHANNEL) {
            const globalWhitelist = Array.isArray(parsed.whitelisted_channels) ? parsed.whitelisted_channels : [];
            return globalWhitelist.map(String).includes(String(channelId));
        }

        // Fallback: deny
        return false;
    } catch (err) {
        try {
            handleError(null, null, err, 'checkFeatureAccess', false).catch(() => {});
        } catch (e) { /* swallow */ }
        return false;
    }
}

module.exports = {
    FEATURE_ACCESS,
    checkFeatureAccess
};
