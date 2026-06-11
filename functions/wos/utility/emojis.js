const { userQueries, customEmojiQueries } = require('./database');

const EMOJI_DEFINITIONS = [
    { key: 1000, name: 'plus', fallback: '➕' },
    { key: 1001, name: 'shield', fallback: '🛡️' },
    { key: 1002, name: 'backArrow', fallback: '⬅️' },
    { key: 1003, name: 'colorPalette', fallback: '🎨' },
    { key: 1004, name: 'correctMark', fallback: '✅' },
    { key: 1005, name: 'calendar', fallback: '📅' },
    { key: 1006, name: 'deFlag', fallback: '🇩🇪' },
    { key: 1007, name: 'downArrow', fallback: '⬇️' },
    { key: 1008, name: 'pencil', fallback: '✏️' },
    { key: 1009, name: 'pin', fallback: '📌' },
    { key: 1010, name: 'frFlag', fallback: '🇫🇷' },
    { key: 1011, name: 'unlocked', fallback: '🔓' },
    { key: 1012, name: 'fire', fallback: '🔥' },
    { key: 1013, name: 'gift', fallback: '🎁' },
    { key: 1014, name: 'mail', fallback: '📧' },
    { key: 1015, name: 'image', fallback: '🖼️' },
    { key: 1016, name: 'rightHandPointer', fallback: '👉' },
    { key: 1017, name: 'info', fallback: 'ℹ️' },
    { key: 1018, name: 'globe', fallback: '🌐' },
    { key: 1019, name: 'leftArrow', fallback: '⬅️' },
    { key: 1020, name: 'paperClip', fallback: '🔗' },
    { key: 1021, name: 'paper', fallback: '📄' },
    { key: 1022, name: 'bell', fallback: '🔔' },
    { key: 1023, name: 'crown', fallback: '👑' },
    { key: 1024, name: 'house', fallback: '🏠' },
    { key: 1025, name: 'clock', fallback: '🕐' },
    { key: 1026, name: 'user', fallback: '👤' },
    { key: 1027, name: 'users', fallback: '👥' },
    { key: 1028, name: 'inputNumbers', fallback: '🔢' },
    { key: 1029, name: 'mailbox', fallback: '📬' },
    { key: 1030, name: 'sandClock', fallback: '⏳' },
    { key: 1031, name: 'minus', fallback: '➖' },
    { key: 1032, name: 'shuffle', fallback: '🔀' },
    { key: 1033, name: 'antiClockwiseOpenCircleArrows', fallback: '🔄' },
    { key: 1034, name: 'rightArrow', fallback: '➡️' },
    { key: 1035, name: 'rocket', fallback: '🚀' },
    { key: 1036, name: 'saFlag', fallback: '🇸🇦' },
    { key: 1037, name: 'floppyDisk', fallback: '💾' },
    { key: 1038, name: 'gear', fallback: '⚙️' },
    { key: 1039, name: 'star', fallback: '⭐' },
    { key: 1040, name: 'classicalBuilding', fallback: '🏛️' },
    { key: 1041, name: 'graph', fallback: '📊' },
    { key: 1042, name: 'tag', fallback: '🏷️' },
    { key: 1043, name: 'target', fallback: '🎯' },
    { key: 1044, name: 'stackedBooks', fallback: '📚' },
    { key: 1045, name: 'potion', fallback: '🧪' },
    { key: 1046, name: 'trash', fallback: '🗑️' },
    { key: 1047, name: 'ukFlag', fallback: '🇬🇧' },
    { key: 1048, name: 'upArrow', fallback: '⬆️' },
    { key: 1049, name: 'eye', fallback: '👁️' },
    { key: 1050, name: 'warning', fallback: '⚠️' },
    { key: 1051, name: 'wrongMark', fallback: '❌' },
    { key: 1052, name: 'noBell', fallback: '🔕' },
];

// Build fallback lookup map from definitions (supports both key and name lookup)
const EMOJI_FALLBACKS = EMOJI_DEFINITIONS.reduce((acc, emoji) => {
    acc[emoji.key] = emoji.fallback;
    acc[emoji.name] = emoji.fallback;
    return acc;
}, {});

function getEmojiDefinitions() {
    return EMOJI_DEFINITIONS;
}

function buildEmojiMapFromSetData(setData) {
    const map = {};
    if (!setData) return map;
    const data = typeof setData === 'string' ? JSON.parse(setData) : setData;
    const emojis = data?.emojis || {};

    Object.entries(emojis).forEach(([key, value]) => {
        if (!value) return;
        if (value.unicode) {
            map[key] = value.unicode;
            if (value.name) map[value.name] = value.unicode;
            return;
        }
        if (value.id && value.name) {
            const prefix = value.animated ? 'a' : '';
            const rendered = `<${prefix}:${value.name}:${value.id}>`;
            map[key] = rendered;
            map[value.name] = rendered;
        }
    });

    return map;
}

function getEmojiMapForUser(userId) {
    const user = userQueries.getUser(userId);
    const customEmojiId = user?.custom_emoji;
    const set = customEmojiId
        ? customEmojiQueries.getCustomEmojiSetById(customEmojiId)
        : customEmojiQueries.getActiveCustomEmojiSet();
    if (!set?.data) return {};
    return buildEmojiMapFromSetData(set.data);
}

/**
 * Gets the global active emoji set (ignores personal user preferences)
 * @returns {Object} Emoji map for the global active set
 */
function getGlobalEmojiMap() {
    const set = customEmojiQueries.getActiveCustomEmojiSet();
    if (!set?.data) return {};
    return buildEmojiMapFromSetData(set.data);
}

function replaceEmojiPlaceholders(text, emojiMap = {}) {
    if (!text) return text;
    return text.replace(/\{emoji\.([a-zA-Z0-9_]+)\}/g, (match, key) => {
        return emojiMap[key] || match;
    });
}

/**
 * Extracts emoji ID for use in buttons/select menus from emoji map
 * @param {Object} emojiMap - The emoji map from getEmojiMapForUser()
 * @param {string} key - The emoji key (e.g., 'shield' or '1001')
 * @returns {string|null} The emoji ID or unicode emoji for .setEmoji()
 * @example
 * const emojiMap = getEmojiMapForUser(userId);
 * button.setEmoji(getComponentEmoji(emojiMap, 'shield'));
 * button.setEmoji(getComponentEmoji(emojiMap, '1001'));
 */
function getComponentEmoji(emojiMap, key) {
    const renderedEmoji = emojiMap?.[key];
    if (!renderedEmoji) {
        // Return fallback from EMOJI_FALLBACKS
        return EMOJI_FALLBACKS[key] || null;
    }
    // If it's unicode emoji, return as-is
    if (!renderedEmoji.startsWith('<')) return renderedEmoji;
    // Extract ID from <:name:id> or <a:name:id>
    const match = renderedEmoji.match(/:(\d+)>/);
    if (!match) {
        // Invalid format, return fallback
        return EMOJI_FALLBACKS[key] || null;
    }

    // Return the emoji ID - Discord will validate it
    // If invalid, Discord API will reject it, so we return fallback as backup
    return match[1] || EMOJI_FALLBACKS[key] || null;
}

/**
 * Wraps a language object with automatic emoji placeholder replacement
 * @param {Object} langObject - The language object from i18n
 * @param {Object} emojiMap - The emoji map from getEmojiMapForUser()
 * @returns {Proxy} A proxied language object that auto-replaces emoji placeholders
 * @example
 * const lang = wrapLangWithEmojis(languages[userLang], emojiMap);
 * lang.panel.title // Automatically has {emoji.XXX} replaced
 */
function wrapLangWithEmojis(langObject, emojiMap) {
    if (!langObject) return langObject;

    return new Proxy(langObject, {
        get(target, prop) {
            const value = target[prop];

            // If it's a string, replace emoji placeholders
            if (typeof value === 'string') {
                return replaceEmojiPlaceholders(value, emojiMap);
            }

            // If it's an object or array, wrap it recursively
            if (value && typeof value === 'object') {
                return wrapLangWithEmojis(value, emojiMap);
            }

            // Return other types as-is
            return value;
        }
    });
}

module.exports = {
    EMOJI_DEFINITIONS,
    getEmojiDefinitions,
    buildEmojiMapFromSetData,
    getEmojiMapForUser,
    getGlobalEmojiMap,
    replaceEmojiPlaceholders,
    getComponentEmoji,
    wrapLangWithEmojis
};