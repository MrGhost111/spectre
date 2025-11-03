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
    fuzzySearchUser(query, guild) {
        const members = Array.from(guild.members.cache.values());
        const searchData = members.map(member => ({
            id: member.id,
            username: member.user.username,
            displayName: member.displayName,
            tag: member.user.tag,
            member: member.user
        }));

        const fuse = new Fuse(searchData, {
            keys: ['username', 'displayName', 'tag'],
            threshold: 0.4,
            includeScore: true
        });

        const results = fuse.search(query);
        return results.length > 0 ? results[0].item.member : null;
    }

    /**
     * Fuzzy search for roles
     */
    fuzzySearchRole(query, guild) {
        const roles = Array.from(guild.roles.cache.values());
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
        return results.length > 0 ? results[0].item.role : null;
    }

    /**
     * Fuzzy search for channels
     */
    fuzzySearchChannel(query, guild) {
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
        return results.length > 0 ? results[0].item.channel : null;
    }

    /**
     * Extract all entities from a message with context-aware parsing
     */
    async parseMessage(message, context = {}) {
        const content = message.content;
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

        // Step 1: Extract mentions
        const userMentions = [...content.matchAll(this.mentionRegex.user)];
        const roleMentions = [...content.matchAll(this.mentionRegex.role)];
        const channelMentions = [...content.matchAll(this.mentionRegex.channel)];

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

        // Step 2: Extract raw IDs and detect their types
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

        // Step 3: Fuzzy search for names (skip common words)
        const skipWords = ['to', 'from', 'the', 'in', 'and', 'or', 'a', 'an', 'my', 'your', 'their', 'this', 'that', 'add', 'remove', 'give', 'take'];
        const filteredWords = words.filter(w =>
            !skipWords.includes(w.toLowerCase()) &&
            !this.idRegex.test(w) &&
            !w.match(/<[@#]/)
        );

        for (const word of filteredWords) {
            entities.raw.names.push(word);

            // Try fuzzy search for user
            const user = this.fuzzySearchUser(word, guild);
            if (user && !entities.users.find(u => u.id === user.id)) {
                entities.users.push(user);
            }

            // Try fuzzy search for role
            const role = this.fuzzySearchRole(word, guild);
            if (role && !entities.roles.find(r => r.id === role.id)) {
                entities.roles.push(role);
            }

            // Try fuzzy search for channel
            const channel = this.fuzzySearchChannel(word, guild);
            if (channel && !entities.channels.find(c => c.id === channel.id)) {
                entities.channels.push(channel);
            }
        }

        // Step 4: Use context to prioritize entities
        if (context.expectUser && entities.users.length > 1) {
            entities.users = [entities.users[0]];
        }
        if (context.expectRole && entities.roles.length > 1) {
            entities.roles = [entities.roles[0]];
        }
        if (context.expectChannel && entities.channels.length > 1) {
            entities.channels = [entities.channels[0]];
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

        // Reorder based on context
        if (context.userFirst && entities.roles.length > 0 && entities.users.length > 0) {
            // Swap if needed based on phrase analysis
            const content = message.content.toLowerCase();
            const roleIndex = content.indexOf(entities.roles[0].name.toLowerCase());
            const userIndex = content.indexOf(entities.users[0].username.toLowerCase());

            if (roleIndex !== -1 && userIndex !== -1 && roleIndex < userIndex) {
                // Role comes before user, but command expects user first
                // This is correct for "give role to user" pattern
            }
        }

        return entities;
    }
}

module.exports = new DiscordEntityParser();