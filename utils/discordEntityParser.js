const Fuse = require('fuse.js');

class DiscordEntityParser {
    constructor() {
        this.mentionRegex = {
            user: /<@!?(\d{17,19})>/g,
            role: /<@&(\d{17,19})>/g,
            channel: /<#(\d{17,19})>/g
        };
        this.idRegex = /^\d{17,19}$/;
    }

    /**
     * Detect if an ID is a user, role, or channel
     */
    async detectIdType(id, guild) {
        const results = {
            user: null,
            role: null,
            channel: null,
            type: null
        };

        // Try to fetch as user
        try {
            const member = await guild.members.fetch(id);
            if (member) {
                results.user = member.user;
                results.type = 'user';
                return results;
            }
        } catch (error) {
            // Not a user
        }

        // Try to find as role
        const role = guild.roles.cache.get(id);
        if (role) {
            results.role = role;
            results.type = 'role';
            return results;
        }

        // Try to find as channel
        const channel = guild.channels.cache.get(id);
        if (channel) {
            results.channel = channel;
            results.type = 'channel';
            return results;
        }

        return results;
    }

    /**
     * Fuzzy search for users
     */
    fuzzySearchUser(query, guild, minScore = 0.3) {
        const members = Array.from(guild.members.cache.values());
        const searchData = members.map(member => ({
            id: member.id,
            username: member.user.username,
            displayName: member.displayName,
            tag: member.user.tag,
            member: member.user
        }));

        const fuse = new Fuse(searchData, {
            keys: [
                { name: 'username', weight: 2 },
                { name: 'displayName', weight: 1.5 },
                { name: 'tag', weight: 1 }
            ],
            threshold: 0.4,
            includeScore: true
        });

        const results = fuse.search(query);
        // Only return if score is good enough
        return results.length > 0 && results[0].score <= minScore ? results[0].item.member : null;
    }

    /**
     * Fuzzy search for roles
     */
    fuzzySearchRole(query, guild, minScore = 0.3) {
        const roles = Array.from(guild.roles.cache.values()).filter(r => r.name !== '@everyone');
        const searchData = roles.map(role => ({
            id: role.id,
            name: role.name,
            role: role
        }));

        const fuse = new Fuse(searchData, {
            keys: ['name'],
            threshold: 0.4,
            includeScore: true
        });

        const results = fuse.search(query);
        return results.length > 0 && results[0].score <= minScore ? results[0].item.role : null;
    }

    /**
     * Fuzzy search for channels
     */
    fuzzySearchChannel(query, guild, minScore = 0.3) {
        const channels = Array.from(guild.channels.cache.values());
        const searchData = channels.map(channel => ({
            id: channel.id,
            name: channel.name,
            channel: channel
        }));

        const fuse = new Fuse(searchData, {
            keys: ['name'],
            threshold: 0.4,
            includeScore: true
        });

        const results = fuse.search(query);
        return results.length > 0 && results[0].score <= minScore ? results[0].item.channel : null;
    }

    /**
     * Clean message content by removing trigger word and common words
     */
    cleanMessageContent(content) {
        // Remove "spectre" trigger word (case insensitive)
        let cleaned = content.replace(/^spectre\s+/i, '');

        return cleaned;
    }

    /**
     * Extract all entities from a message with context-aware parsing
     */
    async parseMessage(message, context = {}) {
        const originalContent = message.content;
        // Clean the content first
        const content = this.cleanMessageContent(originalContent);
        const guild = message.guild;

        const entities = {
            users: [],
            roles: [],
            channels: [],
            raw: {
                mentions: [],
                ids: [],
                names: []
            }
        };

        // Step 1: Extract mentions (these are explicit and highest priority)
        const userMentions = [...originalContent.matchAll(this.mentionRegex.user)];
        const roleMentions = [...originalContent.matchAll(this.mentionRegex.role)];
        const channelMentions = [...originalContent.matchAll(this.mentionRegex.channel)];

        for (const match of userMentions) {
            const userId = match[1];
            try {
                const member = await guild.members.fetch(userId);
                if (member && !entities.users.find(u => u.id === member.user.id)) {
                    entities.users.push(member.user);
                    entities.raw.mentions.push({ type: 'user', id: userId });
                }
            } catch (error) {
                console.error(`Failed to fetch user ${userId}`);
            }
        }

        for (const match of roleMentions) {
            const roleId = match[1];
            const role = guild.roles.cache.get(roleId);
            if (role && !entities.roles.find(r => r.id === role.id)) {
                entities.roles.push(role);
                entities.raw.mentions.push({ type: 'role', id: roleId });
            }
        }

        for (const match of channelMentions) {
            const channelId = match[1];
            const channel = guild.channels.cache.get(channelId);
            if (channel && !entities.channels.find(c => c.id === channel.id)) {
                entities.channels.push(channel);
                entities.raw.mentions.push({ type: 'channel', id: channelId });
            }
        }

        // Step 2: Extract raw IDs and detect their types (only from cleaned content)
        const words = content.split(/\s+/);
        for (const word of words) {
            if (this.idRegex.test(word)) {
                const detected = await this.detectIdType(word, guild);
                entities.raw.ids.push({ id: word, ...detected });

                if (detected.user && !entities.users.find(u => u.id === detected.user.id)) {
                    entities.users.push(detected.user);
                }
                if (detected.role && !entities.roles.find(r => r.id === detected.role.id)) {
                    entities.roles.push(detected.role);
                }
                if (detected.channel && !entities.channels.find(c => c.id === detected.channel.id)) {
                    entities.channels.push(detected.channel);
                }
            }
        }

        // Step 3: Fuzzy search for names (only from cleaned content, skip common words)
        const skipWords = ['to', 'from', 'the', 'in', 'and', 'or', 'a', 'an', 'my', 'your', 'their', 'this', 'that', 'add', 'remove', 'give', 'take', 'role', 'user', 'channel'];
        const filteredWords = words.filter(w =>
            !skipWords.includes(w.toLowerCase()) &&
            !this.idRegex.test(w) &&
            !w.match(/<[@#&]/) &&
            w.length > 1 // Skip single characters
        );

        // Build multi-word phrases for better matching
        const phrases = [];
        for (let i = 0; i < filteredWords.length; i++) {
            // Single word
            phrases.push(filteredWords[i]);

            // Two word phrases
            if (i < filteredWords.length - 1) {
                phrases.push(`${filteredWords[i]} ${filteredWords[i + 1]}`);
            }

            // Three word phrases
            if (i < filteredWords.length - 2) {
                phrases.push(`${filteredWords[i]} ${filteredWords[i + 1]} ${filteredWords[i + 2]}`);
            }
        }

        // Search with phrases (longer phrases first for better accuracy)
        const uniquePhrases = [...new Set(phrases)].sort((a, b) => b.split(' ').length - a.split(' ').length);

        for (const phrase of uniquePhrases) {
            entities.raw.names.push(phrase);

            // Try fuzzy search for user (only if we don't have many users already)
            if (entities.users.length < 3) {
                const user = this.fuzzySearchUser(phrase, guild);
                if (user && !entities.users.find(u => u.id === user.id)) {
                    entities.users.push(user);
                }
            }

            // Try fuzzy search for role (only if we don't have many roles already)
            if (entities.roles.length < 3) {
                const role = this.fuzzySearchRole(phrase, guild);
                if (role && !entities.roles.find(r => r.id === role.id)) {
                    entities.roles.push(role);
                }
            }

            // Try fuzzy search for channel
            if (entities.channels.length < 2) {
                const channel = this.fuzzySearchChannel(phrase, guild);
                if (channel && !entities.channels.find(c => c.id === channel.id)) {
                    entities.channels.push(channel);
                }
            }
        }

        return entities;
    }

    /**
     * Smart entity detection based on command context
     */
    async detectEntitiesForCommand(message, commandType) {
        const contextMap = {
            'giverole': { expectUser: true, expectRole: true, userFirst: false },
            'removerole': { expectUser: true, expectRole: true, userFirst: false },
            'addfriends': { expectUser: true },
            'removefriends': { expectUser: true },
            'viewlock': { expectUser: true, expectChannel: true },
            'addtochannel': { expectUser: true, expectChannel: true },
            'removefromchannel': { expectUser: true, expectChannel: true },
            'movechannel': { expectChannel: true }
        };

        const context = contextMap[commandType] || {};
        const entities = await this.parseMessage(message, context);

        return entities;
    }
}

module.exports = new DiscordEntityParser();