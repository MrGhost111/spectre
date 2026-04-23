// JavaScript source code
// Donations/itemPriceCache.js
// Stores Dank Memer item market average values so item donations can be
// auto-noted without staff intervention.
//
// Prices are cached by item name (case-insensitive, trimmed).
// Cache is persisted to disk so it survives bot restarts.
//
// Flow:
//   1. Someone runs /item in any channel
//   2. mupdate.js detects the embed and calls updateItemPrice()
//   3. Next time that item is donated, getItemPrice() returns the cached avg
//   4. recordDonation() is called automatically with the market avg value

const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, '../data/itemPriceCache.json');

// ─── Load cache from disk ──────────────────────────────────────────────────────
function loadCache() {
    try {
        if (fs.existsSync(CACHE_PATH)) {
            return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
        }
    } catch (e) {
        console.error('[ItemPriceCache] Failed to load cache:', e);
    }
    return {};
}

// ─── Save cache to disk ────────────────────────────────────────────────────────
function saveCache(cache) {
    try {
        const dir = path.dirname(CACHE_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
    } catch (e) {
        console.error('[ItemPriceCache] Failed to save cache:', e);
    }
}

// ─── Normalise item name for consistent key lookup ─────────────────────────────
function normalise(name) {
    return name.trim().toLowerCase();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Update (or insert) a cached item price.
 * @param {string} itemName        - Display name from embed.title (e.g. "A Plus")
 * @param {number} marketAvgValue  - Parsed average market value
 * @param {number|null} netValue   - Optional net/base value
 */
function updateItemPrice(itemName, marketAvgValue, netValue = null) {
    const cache = loadCache();
    const key = normalise(itemName);
    cache[key] = {
        displayName: itemName,
        marketAvgValue,
        netValue,
        lastUpdated: new Date().toISOString(),
    };
    saveCache(cache);
}

/**
 * Retrieve a cached item price entry.
 * @param {string} itemName - Item name to look up (case-insensitive)
 * @returns {{ displayName, marketAvgValue, netValue, lastUpdated } | null}
 */
function getItemPrice(itemName) {
    const cache = loadCache();
    return cache[normalise(itemName)] ?? null;
}

/**
 * Get the full cache (for admin/listing commands).
 * @returns {Object} Raw cache object keyed by normalised item name
 */
function getAllItemPrices() {
    return loadCache();
}

/**
 * Delete a single entry (in case of bad data).
 * @param {string} itemName
 */
function deleteItemPrice(itemName) {
    const cache = loadCache();
    delete cache[normalise(itemName)];
    saveCache(cache);
}

module.exports = {
    updateItemPrice,
    getItemPrice,
    getAllItemPrices,
    deleteItemPrice,
};