const fs = require('fs').promises;
const path = require('path');

class DataManager {
    constructor() {
        this.dataDir = path.join(__dirname, '../data');
        this.files = {
            allow: 'allow.json',
            channels: 'channels.json',
            highlights: 'highlights.json',
            streaks: 'streaks.json',
            stats: 'stats.json',
            cooldowns: 'cooldowns.json',
            bars: 'bars.json',
            donoLogs: 'donoLogs.json'
        };
        this.cache = {};
        this.cacheTimeout = 5000; // 5 seconds
    }

    /**
     * Get file path
     */
    getFilePath(fileKey) {
        return path.join(this.dataDir, this.files[fileKey]);
    }

    /**
     * Read data from file with caching
     */
    async readData(fileKey, useCache = true) {
        if (useCache && this.cache[fileKey] && Date.now() - this.cache[fileKey].timestamp < this.cacheTimeout) {
            return this.cache[fileKey].data;
        }

        try {
            const filePath = this.getFilePath(fileKey);
            const rawData = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(rawData);

            this.cache[fileKey] = {
                data,
                timestamp: Date.now()
            };

            return data;
        } catch (error) {
            console.error(`Error reading ${fileKey}:`, error);
            // Return default structure based on file
            return this.getDefaultStructure(fileKey);
        }
    }

    /**
     * Write data to file
     */
    async writeData(fileKey, data) {
        try {
            const filePath = this.getFilePath(fileKey);
            await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');

            // Update cache
            this.cache[fileKey] = {
                data,
                timestamp: Date.now()
            };

            return true;
        } catch (error) {
            console.error(`Error writing ${fileKey}:`, error);
            return false;
        }
    }

    /**
     * Get default structure for files
     */
    getDefaultStructure(fileKey) {
        const defaults = {
            allow: {},
            channels: {},
            highlights: {},
            streaks: { users: [] },
            stats: { users: [] },
            cooldowns: { users: [] },
            bars: { bars: {} },
            donoLogs: {}
        };
        return defaults[fileKey] || {};
    }

    /**
     * Query allow.json data
     */
    async getAllowData(userId = null) {
        const data = await this.readData('allow');

        if (userId) {
            if (data[userId]) {
                return {
                    userId,
                    allowedAt: new Date(data[userId].allowedAt).toLocaleString(),
                    allowedBy: data[userId].allowedBy
                };
            }
            return null;
        }

        return data;
    }

    /**
     * Query channels.json data
     */
    async getChannelData(userId = null) {
        const data = await this.readData('channels');

        if (userId) {
            return data[userId] || null;
        }

        return data;
    }

    /**
     * Add friend to channel
     */
    async addFriendToChannel(ownerId, friendId) {
        const data = await this.readData('channels');

        if (!data[ownerId]) {
            return { success: false, message: "Channel not found" };
        }

        if (!data[ownerId].friends) {
            data[ownerId].friends = [];
        }

        if (data[ownerId].friends.includes(friendId)) {
            return { success: false, message: "Friend already in list" };
        }

        data[ownerId].friends.push(friendId);
        await this.writeData('channels', data);

        return { success: true, message: "Friend added" };
    }

    /**
     * Remove friend from channel
     */
    async removeFriendFromChannel(ownerId, friendId) {
        const data = await this.readData('channels');

        if (!data[ownerId]) {
            return { success: false, message: "Channel not found" };
        }

        if (!data[ownerId].friends || !data[ownerId].friends.includes(friendId)) {
            return { success: false, message: "Friend not in list" };
        }

        data[ownerId].friends = data[ownerId].friends.filter(id => id !== friendId);
        await this.writeData('channels', data);

        return { success: true, message: "Friend removed" };
    }

    /**
     * Query highlights.json data
     */
    async getHighlightData(userId = null) {
        const data = await this.readData('highlights');

        if (userId) {
            return data[userId] || null;
        }

        return data;
    }

    /**
     * Add highlight word
     */
    async addHighlight(userId, word) {
        const data = await this.readData('highlights');

        if (!data[userId]) {
            data[userId] = { words: [], blacklist: { words: [], users: [], channels: [] } };
        }

        if (!data[userId].words.includes(word.toLowerCase())) {
            data[userId].words.push(word.toLowerCase());
            await this.writeData('highlights', data);
            return { success: true, message: "Highlight added" };
        }

        return { success: false, message: "Highlight already exists" };
    }

    /**
     * Remove highlight word
     */
    async removeHighlight(userId, word) {
        const data = await this.readData('highlights');

        if (!data[userId] || !data[userId].words.includes(word.toLowerCase())) {
            return { success: false, message: "Highlight not found" };
        }

        data[userId].words = data[userId].words.filter(w => w !== word.toLowerCase());
        await this.writeData('highlights', data);

        return { success: true, message: "Highlight removed" };
    }

    /**
     * Search across all data files
     */
    async searchData(query, fileKey = null) {
        if (fileKey) {
            const data = await this.readData(fileKey);
            return this.searchInData(data, query);
        }

        // Search all files
        const results = {};
        for (const key of Object.keys(this.files)) {
            const data = await this.readData(key);
            const found = this.searchInData(data, query);
            if (found.length > 0) {
                results[key] = found;
            }
        }

        return results;
    }

    /**
     * Helper to search in data object
     */
    searchInData(obj, query, path = '') {
        const results = [];
        const queryLower = query.toLowerCase();

        for (const key in obj) {
            const value = obj[key];
            const currentPath = path ? `${path}.${key}` : key;

            // Check if key or value matches query
            if (key.toLowerCase().includes(queryLower) ||
                (typeof value === 'string' && value.toLowerCase().includes(queryLower))) {
                results.push({ path: currentPath, key, value });
            }

            // Recurse if object
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                results.push(...this.searchInData(value, query, currentPath));
            }

            // Check arrays
            if (Array.isArray(value)) {
                value.forEach((item, index) => {
                    if (typeof item === 'object') {
                        results.push(...this.searchInData(item, query, `${currentPath}[${index}]`));
                    } else if (typeof item === 'string' && item.toLowerCase().includes(queryLower)) {
                        results.push({ path: `${currentPath}[${index}]`, value: item });
                    }
                });
            }
        }

        return results;
    }

    /**
     * Clear cache
     */
    clearCache(fileKey = null) {
        if (fileKey) {
            delete this.cache[fileKey];
        } else {
            this.cache = {};
        }
    }
}

module.exports = new DataManager();