// events/mupdate.js
// Responsibilities:
//   1. Track edited messages for snipe
//   2. Delegate all Dank Memer message handling to dankDetection.js
//
// WHY the delegation pattern:
//   Dank Memer slash-command responses are fully formed on messageCreate —
//   messageUpdate never fires for them. Text-command responses are edited
//   in (embed added later), so only messageUpdate fires. By calling the same
//   handleDankMessage() from both events with a shared dedup Set, we catch
//   both cases without ever double-processing.

const { Events } = require('discord.js');
const { DANK_MEMER_BOT_ID } = require('../Donations/donationFlow');
const { handleDankMessage } = require('../Donations/dankDetection');

module.exports = {
    name: Events.MessageUpdate,

    async execute(client, oldMessage, newMessage) {
        try {
            // ── Fetch full message if partial ─────────────────────────────────
            if (newMessage.partial) {
                try { await newMessage.fetch(); }
                catch (e) { console.error('[MUPDATE] Failed to fetch partial:', e); return; }
            }

            // ── Snipe tracking ────────────────────────────────────────────────
            if (
                oldMessage.content &&
                newMessage.content &&
                oldMessage.content !== newMessage.content
            ) {
                if (!client.editedMessages) client.editedMessages = new Map();
                const channelEdits = client.editedMessages.get(newMessage.channel.id) || [];
                if (channelEdits.length >= 50) channelEdits.shift();
                channelEdits.push({
                    author: newMessage.author?.tag,
                    oldContent: oldMessage.content,
                    newContent: newMessage.content,
                    timestamp: Math.floor(Date.now() / 1000),
                    messageId: newMessage.id,
                });
                client.editedMessages.set(newMessage.channel.id, channelEdits);
            }

            // ── Dank Memer handling (donations + item price caching) ───────────
            if (newMessage.author?.id === DANK_MEMER_BOT_ID) {
                await handleDankMessage(client, newMessage);
            }

        } catch (e) {
            console.error('[MUPDATE] Unhandled error:', e);
        }
    },
};