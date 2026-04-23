// JavaScript source code
// text-commands/inspect.js
// Usage: reply to any message and run ",inspect"
// Dumps the full structure of the replied-to message so we can study embeds/components.

module.exports = {
    name: 'inspect',
    aliases: ['ins', 'msgdata'],

    async execute(message, args) {
        // ── Must be a reply ────────────────────────────────────────────────────
        const ref = message.reference;
        if (!ref?.messageId) {
            return message.reply('❌ You need to **reply** to a message to inspect it.');
        }

        // ── Fetch the target message ───────────────────────────────────────────
        let target;
        try {
            target = await message.channel.messages.fetch(ref.messageId);
        } catch (e) {
            return message.reply(`❌ Could not fetch that message: \`${e.message}\``);
        }

        // ── Build the report ───────────────────────────────────────────────────
        const lines = [];

        lines.push(`**📨 Message Inspect Report**`);
        lines.push(`Author: \`${target.author?.tag}\` (ID: \`${target.author?.id}\`)`);
        lines.push(`Channel: <#${target.channel.id}>`);
        lines.push(`Message ID: \`${target.id}\``);
        lines.push(`Interaction user: \`${target.interaction?.user?.tag ?? target.interactionMetadata?.user?.tag ?? 'none'}\``);
        lines.push('');

        // ── Plain content ──────────────────────────────────────────────────────
        if (target.content) {
            lines.push(`**📝 Content:**`);
            lines.push(`\`\`\`${target.content.substring(0, 800)}\`\`\``);
        } else {
            lines.push(`**📝 Content:** *(empty)*`);
        }

        // ── Embeds ─────────────────────────────────────────────────────────────
        if (target.embeds?.length) {
            lines.push(`\n**🖼️ Embeds (${target.embeds.length}):**`);
            target.embeds.forEach((embed, i) => {
                lines.push(`\n**Embed [${i}]:**`);
                if (embed.title) lines.push(`  title: \`${embed.title}\``);
                if (embed.description) lines.push(`  description: \`${embed.description.substring(0, 300)}\``);
                if (embed.url) lines.push(`  url: \`${embed.url}\``);
                if (embed.color != null) lines.push(`  color: \`${embed.color}\``);

                if (embed.author) {
                    lines.push(`  author.name: \`${embed.author.name}\``);
                    if (embed.author.url) lines.push(`  author.url: \`${embed.author.url}\``);
                }

                if (embed.thumbnail) lines.push(`  thumbnail.url: \`${embed.thumbnail.url}\``);
                if (embed.image) lines.push(`  image.url: \`${embed.image.url}\``);
                if (embed.footer) lines.push(`  footer.text: \`${embed.footer.text}\``);

                if (embed.fields?.length) {
                    lines.push(`  fields (${embed.fields.length}):`);
                    embed.fields.forEach((f, fi) => {
                        lines.push(`    [${fi}] name: \`${f.name}\`  value: \`${f.value.substring(0, 200)}\`  inline: ${f.inline}`);
                    });
                }
            });
        } else {
            lines.push(`\n**🖼️ Embeds:** *(none)*`);
        }

        // ── Components (V2 / regular) ──────────────────────────────────────────
        if (target.components?.length) {
            lines.push(`\n**🔘 Components (top-level rows: ${target.components.length}):**`);
            lines.push(`\`\`\`json\n${JSON.stringify(
                target.components.map(c => c.toJSON ? c.toJSON() : c),
                null, 2
            ).substring(0, 1500)}\`\`\``);
        } else {
            lines.push(`\n**🔘 Components:** *(none)*`);
        }

        // ── Attachments ────────────────────────────────────────────────────────
        if (target.attachments?.size) {
            lines.push(`\n**📎 Attachments (${target.attachments.size}):**`);
            target.attachments.forEach(a => {
                lines.push(`  \`${a.name}\` — ${a.contentType} — ${a.url.substring(0, 80)}`);
            });
        }

        // ── Raw components JSON dump (for deep V2 inspection) ─────────────────
        if (target.components?.length) {
            lines.push(`\n**🔬 Raw components JSON (full):**`);
            const raw = JSON.stringify(
                target.components.map(c => c.toJSON ? c.toJSON() : c),
                null, 2
            );

            // Discord has a 2000-char limit per message, so chunk it
            const chunks = chunkString(raw, 1800);
            // We'll append the first chunk here; extras sent below
            lines.push(`\`\`\`json\n${chunks[0]}\`\`\``);

            const fullReport = lines.join('\n');
            const reportChunks = chunkString(fullReport, 1900);

            for (const chunk of reportChunks) {
                await message.channel.send(chunk).catch(() => { });
            }

            // Extra raw JSON chunks if needed
            for (let i = 1; i < chunks.length; i++) {
                await message.channel.send(`\`\`\`json\n${chunks[i]}\`\`\``).catch(() => { });
            }

            return; // already sent
        }

        // ── Send report (no extra component chunks needed) ────────────────────
        const fullReport = lines.join('\n');
        const reportChunks = chunkString(fullReport, 1900);
        for (const chunk of reportChunks) {
            await message.channel.send(chunk).catch(() => { });
        }
    },
};

function chunkString(str, size) {
    const chunks = [];
    let i = 0;
    while (i < str.length) {
        chunks.push(str.slice(i, i + size));
        i += size;
    }
    return chunks;
}