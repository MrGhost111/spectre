const fs = require('fs');
const path = require('path');
const { HfInference } = require('@huggingface/inference');

require('dotenv').config();

const COUNT_DATA_PATH = path.join(__dirname, '../data/count.json');
const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

// ─── Word-to-number map ───────────────────────────────────────────────────────
const WORD_MAP = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
    eighty: 80, ninety: 90, hundred: 100, thousand: 1000
};

// ─── Data helpers ─────────────────────────────────────────────────────────────
function loadCountData() {
    if (!fs.existsSync(COUNT_DATA_PATH)) {
        const initial = { currentCount: 0 };
        fs.mkdirSync(path.dirname(COUNT_DATA_PATH), { recursive: true });
        fs.writeFileSync(COUNT_DATA_PATH, JSON.stringify(initial, null, 2), 'utf8');
        console.log('📁 Created count.json for the first time');
        return initial;
    }
    return JSON.parse(fs.readFileSync(COUNT_DATA_PATH, 'utf8'));
}

function saveCountData(data) {
    fs.writeFileSync(COUNT_DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ─── Quick plain-number extraction ───────────────────────────────────────────
// Looks for a standalone integer in the message (e.g. "20" or "one of the 20")
function extractPlainNumber(content) {
    const matches = content.match(/\b(\d+)\b/g);
    if (!matches) return null;
    // Return the first number found
    return parseInt(matches[0], 10);
}

// ─── Quick word-number extraction ────────────────────────────────────────────
// Checks if the FIRST standalone word in the message is a number word (e.g. "one", "twenty")
function extractWordNumber(content) {
    const words = content.toLowerCase().trim().split(/\s+/);
    // Only trigger if the very first token is a number word (pure count messages like "twenty one")
    let total = 0;
    let found = false;
    for (const word of words) {
        if (WORD_MAP.hasOwnProperty(word)) {
            total += WORD_MAP[word];
            found = true;
        } else if (found) {
            // stop accumulating once we hit a non-number word
            break;
        }
    }
    return found ? total : null;
}

// ─── AI: extract number + suggest emoji ──────────────────────────────────────
async function aiAnalyzeMessage(content, expectedCount) {
    const prompt = `You are analyzing a Discord counting game message. The expected next number is ${expectedCount}.

Message: "${content}"

Your tasks:
1. Figure out if this message contains the number ${expectedCount} — either as a digit (${expectedCount}) or as a word (e.g. "twenty" for 20). It may be embedded in a sentence like "one of the ${expectedCount}" or "let's count to ${expectedCount}".
2. If the number IS present, suggest ONE creative default Discord emoji (like 🥞 🍕 🎉 🐶 etc.) that matches the theme/context of the message. Do NOT suggest ✅ — that's reserved.
3. If the number is NOT present, return null for the emoji.

Respond ONLY with valid JSON, no explanation:
{
  "numberFound": true or false,
  "suggestedEmoji": "🥞" or null
}`;

    try {
        const response = await hf.chatCompletion({
            model: "Qwen/Qwen2.5-Coder-32B-Instruct",
            messages: [
                { role: "system", content: "You are a precise message analyzer. Respond only with valid JSON." },
                { role: "user", content: prompt }
            ],
            max_tokens: 100,
            temperature: 0.2
        });

        const raw = response.choices[0].message.content;
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return { numberFound: false, suggestedEmoji: null };
        return JSON.parse(jsonMatch[0]);
    } catch (err) {
        console.error('Counting AI error:', err);
        return { numberFound: false, suggestedEmoji: null };
    }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
/**
 * Call this from your messageCreate event.
 * @param {import('discord.js').Message} message
 * @param {string} countingChannelId  - the channel ID where counting happens
 */
async function handleCountingMessage(message, countingChannelId) {
    if (message.channelId !== countingChannelId) return;
    if (message.author.bot) return;

    const data = loadCountData();
    const expected = data.currentCount + 1;
    const content = message.content.trim();

    // ── Fast path: message is ONLY a plain number ─────────────────────────────
    const isOnlyNumber = /^\d+$/.test(content);
    if (isOnlyNumber) {
        const num = parseInt(content, 10);
        if (num === expected) {
            // React tick instantly
            await message.react('✅').catch(() => {});
            data.currentCount = expected;
            saveCountData(data);

            // AI emoji in background (non-blocking)
            // Pure number — no extra context, skip AI emoji to keep it clean
        }
        // Wrong number → just ignore (no reaction)
        return;
    }

    // ── Fast path: message contains a plain number somewhere ─────────────────
    const plainNum = extractPlainNumber(content);
    if (plainNum !== null) {
        if (plainNum === expected) {
            // React tick instantly (don't wait for AI)
            await message.react('✅').catch(() => {});
            data.currentCount = expected;
            saveCountData(data);

            // AI emoji in background
            aiAnalyzeMessage(content, expected).then(async (aiResult) => {
                if (aiResult.suggestedEmoji) {
                    await message.react(aiResult.suggestedEmoji).catch(() => {});
                }
            }).catch(() => {});
        }
        // Wrong plain number → ignore
        return;
    }

    // ── Slow path: no plain number found — ask AI ─────────────────────────────
    // (handles word numbers like "twenty" or numbers buried in sentences without digits)
    const aiResult = await aiAnalyzeMessage(content, expected);

    if (aiResult.numberFound) {
        await message.react('✅').catch(() => {});
        data.currentCount = expected;
        saveCountData(data);

        if (aiResult.suggestedEmoji) {
            await message.react(aiResult.suggestedEmoji).catch(() => {});
        }
    }
    // Doesn't contain expected number → ignore silently
}

module.exports = { handleCountingMessage };
