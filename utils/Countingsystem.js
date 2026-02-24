const fs = require('fs');
const path = require('path');
const { HfInference } = require('@huggingface/inference');

require('dotenv').config();

const COUNT_DATA_PATH = path.join(__dirname, '../data/count.json');
const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

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

// ─── Safe math evaluator (no eval) ───────────────────────────────────────────
// Supports: + - * / ^ ** root sqrt and brackets
function safeMath(expr) {
    try {
        let e = expr
            .replace(/\s+/g, '')
            .replace(/\^/g, '**')
            .replace(/sqrt\(([^)]+)\)/g, 'Math.sqrt($1)')
            .replace(/root\(([^)]+)\)/g, 'Math.sqrt($1)');

        // Only allow safe characters
        const stripped = e.replace(/Math\.sqrt/g, '').replace(/Math\.pow/g, '');
        if (!/^[0-9+\-*/().\s]+$/.test(stripped)) return null;

        const result = new Function('"use strict"; return (' + e + ')')();
        if (typeof result !== 'number' || !isFinite(result)) return null;

        // Return integer if whole number
        return Math.abs(result - Math.round(result)) < 1e-9 ? Math.round(result) : result;
    } catch {
        return null;
    }
}

// ─── Word math → expression converter ────────────────────────────────────────
// Handles: "4 minus 2", "3 plus 1", "10 divided by 2", "2 squared", "sqrt of 9"
function wordMathToExpr(content) {
    let e = content.toLowerCase().trim()
        .replace(/\bplus\b/g, '+')
        .replace(/\bminus\b/g, '-')
        .replace(/\btimes\b/g, '*')
        .replace(/\bmultiplied by\b/g, '*')
        .replace(/\bdivided by\b/g, '/')
        .replace(/\bover\b/g, '/')
        .replace(/\bto the power of\b/g, '**')
        .replace(/\bsquared\b/g, '**2')
        .replace(/\bcubed\b/g, '**3')
        .replace(/\bsquare root of\b/g, 'sqrt(')
        .replace(/\broot of\b/g, 'sqrt(')
        .replace(/\bsqrt of\b/g, 'sqrt(');

    // Close any unclosed sqrt( parens
    const openCount = (e.match(/\(/g) || []).length;
    const closeCount = (e.match(/\)/g) || []).length;
    if (openCount > closeCount) e += ')'.repeat(openCount - closeCount);

    return e;
}

// ─── Try to evaluate the message as a math expression ────────────────────────
function tryEvalMath(content) {
    // Try direct expression first (2+2, (3+4)*2, 2**3, sqrt(9), etc.)
    const direct = safeMath(content);
    if (direct !== null) return direct;

    // Try word-math conversion (4 minus 2, square root of 9, etc.)
    const converted = wordMathToExpr(content);
    if (converted !== content.toLowerCase().trim()) {
        const result = safeMath(converted);
        if (result !== null) return result;
    }

    return null;
}

// ─── Extract a plain number from message ─────────────────────────────────────
function extractPlainNumber(content) {
    const trimmed = content.trim();
    if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
    const matches = trimmed.match(/\b(\d+)\b/g);
    if (matches) return parseInt(matches[0], 10);
    return null;
}

// ─── AI: analyze message for number + suggest emoji ──────────────────────────
async function aiAnalyzeMessage(content, expectedCount) {
    const prompt = `You are analyzing a Discord counting game message. The expected next number is ${expectedCount}.

Message: "${content}"

Your tasks:
1. Determine if this message evaluates to or contains the number ${expectedCount}.
   This includes:
   - Plain number: "${expectedCount}" or word form like "twenty" for 20
   - Number in a sentence: "one of the ${expectedCount}" or "let's get to ${expectedCount}"
   - Math expression in words: "4 plus 16", "100 minus 80", "4 times 5", "40 divided by 2", "2 to the power of 4 plus 4"
   - Any valid expression that equals ${expectedCount}
2. If it DOES equal or contain ${expectedCount}, suggest ONE creative default Discord emoji
   matching the theme/context (e.g. 🥞 🍕 🎉 🐶 🚀 🧮 ➕). Do NOT suggest ✅.
3. If it does NOT equal ${expectedCount}, return numberFound: false.

Respond ONLY with valid JSON:
{
  "numberFound": true or false,
  "suggestedEmoji": "🥞" or null
}`;

    try {
        const response = await hf.chatCompletion({
            model: "Qwen/Qwen2.5-Coder-32B-Instruct",
            messages: [
                { role: "system", content: "You are a precise message and math analyzer. Respond only with valid JSON." },
                { role: "user", content: prompt }
            ],
            max_tokens: 100,
            temperature: 0.1
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
async function handleCountingMessage(message, countingChannelId) {
    if (message.channelId !== countingChannelId) return;
    if (message.author.bot) return;

    const data = loadCountData();
    const expected = data.currentCount + 1;
    const content = message.content.trim();

    // ── Fast path 1: message is ONLY a plain number ───────────────────────────
    if (/^\d+$/.test(content)) {
        const num = parseInt(content, 10);
        if (num === expected) {
            await message.react('✅').catch(() => { });
            data.currentCount = expected;
            saveCountData(data);
        }
        return;
    }

    // ── Fast path 2: local math evaluator (handles +,-,*,/,^,sqrt,brackets) ──
    const mathResult = tryEvalMath(content);
    if (mathResult !== null) {
        if (mathResult === expected) {
            await message.react('✅').catch(() => { });
            data.currentCount = expected;
            saveCountData(data);

            // AI emoji in background
            aiAnalyzeMessage(content, expected).then(async (aiResult) => {
                if (aiResult.suggestedEmoji) {
                    await message.react(aiResult.suggestedEmoji).catch(() => { });
                }
            }).catch(() => { });
        }
        // Wrong math result → ignore silently
        return;
    }

    // ── Fast path 3: contains a plain number somewhere in the message ─────────
    const plainNum = extractPlainNumber(content);
    if (plainNum !== null) {
        if (plainNum === expected) {
            await message.react('✅').catch(() => { });
            data.currentCount = expected;
            saveCountData(data);

            // AI emoji in background
            aiAnalyzeMessage(content, expected).then(async (aiResult) => {
                if (aiResult.suggestedEmoji) {
                    await message.react(aiResult.suggestedEmoji).catch(() => { });
                }
            }).catch(() => { });
        }
        return;
    }

    // ── Slow path: no digits at all — let AI figure it out ───────────────────
    // Handles: "twenty", "four plus sixteen", "one hundred minus eighty", etc.
    const aiResult = await aiAnalyzeMessage(content, expected);
    if (aiResult.numberFound) {
        await message.react('✅').catch(() => { });
        data.currentCount = expected;
        saveCountData(data);

        if (aiResult.suggestedEmoji) {
            await message.react(aiResult.suggestedEmoji).catch(() => { });
        }
    }
}

module.exports = { handleCountingMessage };