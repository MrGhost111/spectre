// JavaScript source code
// text-commands/itemprice.js
// Admin command to view, manually set, or delete cached item prices.
//
// Usage:
//   ,itemprice list [page]                 — show all cached prices (paginated)
//   ,itemprice get <item name>             — look up one item
//   ,itemprice set <item name> | <amount>  — manually set a price
//   ,itemprice delete <item name>          — remove from cache

const { EmbedBuilder } = require('discord.js');
const {
    getAllItemPrices,
    getItemPrice,
    updateItemPrice,
    deleteItemPrice,
} = require('../Donations/itemPriceCache');

const STAFF_ROLE_ID = '712970141834674207';
const PAGE_SIZE = 20;

module.exports = {
    name: 'itemprice',
    aliases: ['ip', 'itemcache'],

    async execute(message, args) {
        // ── Permission check ──────────────────────────────────────────────────
        if (!message.member?.roles.cache.has(STAFF_ROLE_ID) && !message.member?.permissions.has('Administrator')) {
            return message.reply('❌ You need the staff role to use this command.');
        }

        const sub = (args[0] || 'list').toLowerCase();

        // ── LIST ──────────────────────────────────────────────────────────────
        if (sub === 'list') {
            const cache = getAllItemPrices();
            const entries = Object.values(cache);

            if (entries.length === 0) {
                return message.reply('📦 No item prices cached yet. Use `/item` in any channel and I\'ll auto-detect the price.');
            }

            // Sort alphabetically
            entries.sort((a, b) => a.displayName.localeCompare(b.displayName));

            const totalPages = Math.ceil(entries.length / PAGE_SIZE);

            // Parse optional page number from args[1]
            let page = 1;
            if (args[1]) {
                page = parseInt(args[1], 10);
                if (isNaN(page) || page < 1) page = 1;
                if (page > totalPages) page = totalPages;
            }

            const start = (page - 1) * PAGE_SIZE;
            const slice = entries.slice(start, start + PAGE_SIZE);

            const lines = slice.map(e => {
                const updated = e.lastUpdated
                    ? `<t:${Math.floor(new Date(e.lastUpdated).getTime() / 1000)}:R>`
                    : 'unknown';
                return `**${e.displayName}** — ${e.marketAvgValue.toLocaleString()}${e.netValue :} *(updated ${updated})*`;
            });

            const embed = new EmbedBuilder()
                .setTitle('📦 Item Price Cache')
                .setColor('#4c00b0')
                .setDescription(lines.join('\n'))
                .setFooter({ text: `Page ${page} of ${totalPages} • ${entries.length} item(s) total` })
                .setTimestamp();

            return message.channel.send({ embeds: [embed] });
        }

        // ── GET ───────────────────────────────────────────────────────────────
        if (sub === 'get') {
            const itemName = args.slice(1).join(' ');
            if (!itemName) return message.reply('Usage: `,itemprice get <item name>`');

            const entry = getItemPrice(itemName);
            if (!entry) return message.reply(`❌ No cached price for **${itemName}**. Use \`/item\` on it first.`);

            const updated = entry.lastUpdated
                ? `<t:${Math.floor(new Date(entry.lastUpdated).getTime() / 1000)}:R>`
                : 'unknown';

            const embed = new EmbedBuilder()
                .setTitle(`📦 ${entry.displayName}`)
                .setColor('#4c00b0')
                .addFields(
                    { name: 'Market Avg Value', value: `⏣ ${entry.marketAvgValue.toLocaleString()}`, inline: true },
                    { name: 'Net Value', value: entry.netValue ? `⏣ ${entry.netValue.toLocaleString()}` : 'N/A', inline: true },
                    { name: 'Last Updated', value: updated, inline: true },
                )
                .setTimestamp();

            return message.channel.send({ embeds: [embed] });
        }

        // ── SET ───────────────────────────────────────────────────────────────
        if (sub === 'set') {
            const rest = args.slice(1).join(' ');
            const parts = rest.split('|');
            if (parts.length < 2) return message.reply('Usage: `,itemprice set <item name> | <amount>`\nExample: `,itemprice set A Plus | 6000000`');

            const itemName = parts[0].trim();
            const amount = parseInt(parts[1].replace(/[^0-9]/g, ''), 10);

            if (!itemName) return message.reply('❌ Item name cannot be empty.');
            if (isNaN(amount) || amount <= 0) return message.reply('❌ Invalid amount.');

            updateItemPrice(itemName, amount, null);
            return message.reply(`✅ Cached **${itemName}** → avg ⏣ ${amount.toLocaleString()}`);
        }

        // ── DELETE ────────────────────────────────────────────────────────────
        if (sub === 'delete' || sub === 'remove' || sub === 'del') {
            const itemName = args.slice(1).join(' ');
            if (!itemName) return message.reply('Usage: `,itemprice delete <item name>`');

            const existing = getItemPrice(itemName);
            if (!existing) return message.reply(`❌ No cached price found for **${itemName}**.`);

            deleteItemPrice(itemName);
            return message.reply(`✅ Removed **${itemName}** from cache.`);
        }

        return message.reply('❓ Unknown subcommand. Options: `list [page]`, `get <name>`, `set <name> | <amount>`, `delete <name>`');
    },
};