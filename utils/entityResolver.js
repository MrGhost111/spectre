// JavaScript source code
const Fuse = require('fuse.js');
const { ChannelType } = require('discord.js');

class EntityResolver {
    /**
     * Find user by name using fuzzy search
     */
    async findUser(query, guild) {
        // First check for exact ID match
        if (/^\d{17,19}$/.test(query)) {
            try {
                const member = await guild.members.fetch(query);
                return member ? member.user : null;
            } catch (error) {
                // Not a valid user ID
            }
        }

        // Prepare search data
        const members = Array.from(guild.members.cache.values());
        const searchData = members
            .filter(member => !member.user.bot)
            .map(member => ({
                user: member.user,
                username: member.user.username.toLowerCase(),
                displayName: member.displayName.toLowerCase(),
                tag: member.user.tag.toLowerCase()
            }));

        // Exact match first
        const exactMatch = searchData.find(data =>
            data.username === query.toLowerCase() ||
            data.displayName === query.toLowerCase()
        );
        if (exactMatch) return exactMatch.user;

        // Fuzzy search
        const fuse = new Fuse(searchData, {
            keys: [
                { name: 'username', weight: 2 },
                { name: 'displayName', weight: 1.5 }
            ],
            threshold: 0.3,
            includeScore: true
        });

        const results = fuse.search(query);
        return results.length > 0 ? results[0].item.user : null;
    }

    /**
     * Find role by name using fuzzy search
     */
    findRole(query, guild) {
        // First check for exact ID match
        if (/^\d{17,19}$/.test(query)) {
            const role = guild.roles.cache.get(query);
            if (role) return role;
        }

        // Filter out @everyone
        const roles = Array.from(guild.roles.cache.values())
            .filter(role => role.name !== '@everyone');

        // Prepare search data
        const searchData = roles.map(role => ({
            role: role,
            name: role.name.toLowerCase()
        }));

        // Exact match first
        const exactMatch = searchData.find(data =>
            data.name === query.toLowerCase()
        );
        if (exactMatch) return exactMatch.role;

        // Fuzzy search
        const fuse = new Fuse(searchData, {
            keys: ['name'],
            threshold: 0.3,
            includeScore: true
        });

        const results = fuse.search(query);
        return results.length > 0 ? results[0].item.role : null;
    }

    /**
     * Find channel by name using fuzzy search
     */
    findChannel(query, guild) {
        // First check for exact ID match
        if (/^\d{17,19}$/.test(query)) {
            const channel = guild.channels.cache.get(query);
            if (channel && channel.type !== ChannelType.GuildCategory) {
                return channel;
            }
        }

        // Get all non-category channels
        const channels = Array.from(guild.channels.cache.values())
            .filter(channel => channel.type !== ChannelType.GuildCategory);

        // Prepare search data
        const searchData = channels.map(channel => ({
            channel: channel,
            name: channel.name.toLowerCase()
        }));

        // Exact match first
        const exactMatch = searchData.find(data =>
            data.name === query.toLowerCase()
        );
        if (exactMatch) return exactMatch.channel;

        // Fuzzy search
        const fuse = new Fuse(searchData, {
            keys: ['name'],
            threshold: 0.3,
            includeScore: true
        });

        const results = fuse.search(query);
        return results.length > 0 ? results[0].item.channel : null;
    }

    /**
     * Find category by name using fuzzy search
     */
    findCategory(query, guild) {
        // First check for exact ID match
        if (/^\d{17,19}$/.test(query)) {
            const category = guild.channels.cache.get(query);
            if (category && category.type === ChannelType.GuildCategory) {
                return category;
            }
        }

        // Get all categories
        const categories = Array.from(guild.channels.cache.values())
            .filter(channel => channel.type === ChannelType.GuildCategory);

        // Prepare search data
        const searchData = categories.map(category => ({
            category: category,
            name: category.name.toLowerCase()
        }));

        // Exact match first
        const exactMatch = searchData.find(data =>
            data.name === query.toLowerCase()
        );
        if (exactMatch) return exactMatch.category;

        // Fuzzy search
        const fuse = new Fuse(searchData, {
            keys: ['name'],
            threshold: 0.3,
            includeScore: true
        });

        const results = fuse.search(query);
        return results.length > 0 ? results[0].item.category : null;
    }

    /**
     * Parse and resolve all entities from a message
     */
    async resolveFromMessage(message) {
        const resolved = {
            users: [],
            roles: [],
            channels: [],
            categories: []
        };

        // Get mentions
        if (message.mentions.users.size > 0) {
            message.mentions.users.forEach(user => {
                if (!user.bot) {
                    resolved.users.push(user);
                }
            });
        }

        if (message.mentions.roles.size > 0) {
            message.mentions.roles.forEach(role => {
                resolved.roles.push(role);
            });
        }

        if (message.mentions.channels.size > 0) {
            message.mentions.channels.forEach(channel => {
                if (channel.type === ChannelType.GuildCategory) {
                    resolved.categories.push(channel);
                } else {
                    resolved.channels.push(channel);
                }
            });
        }

        return resolved;
    }

    /**
     * Get ID type (user, role, channel, or unknown)
     */
    async getIdType(id, guild) {
        if (!/^\d{17,19}$/.test(id)) {
            return 'invalid';
        }

        // Try user
        try {
            const member = await guild.members.fetch(id);
            if (member) return 'user';
        } catch (error) {
            // Not a user
        }

        // Try role
        const role = guild.roles.cache.get(id);
        if (role) return 'role';

        // Try channel
        const channel = guild.channels.cache.get(id);
        if (channel) {
            return channel.type === ChannelType.GuildCategory ? 'category' : 'channel';
        }

        return 'unknown';
    }
}

module.exports = new EntityResolver();