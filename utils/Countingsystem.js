const fs = require('fs');
const path = require('path');
const { HfInference } = require('@huggingface/inference');

require('dotenv').config();

const COUNT_DATA_PATH = path.join(__dirname, '../data/count.json');
const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

// ─── Data helpers ─────────────────────────────────────────────────────────────
function loadCountData() {
    if (!fs.existsSync(COUNT_DATA_PATH)) {
        const initial = { currentCount: 0, lastUser: null, lastUsername: null };
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

// ─── Safe math evaluator (no eval, digits only) ───────────────────────────────
function safeMath(expr) {
    try {
        let e = expr
            .replace(/\s+/g, '')
            .replace(/\^/g, '**')
            .replace(/sqrt\(([^)]+)\)/g, 'Math.sqrt($1)')
            .replace(/root\(([^)]+)\)/g, 'Math.sqrt($1)');

        const stripped = e.replace(/Math\.sqrt/g, '').replace(/Math\.pow/g, '');
        if (!/^[0-9+\-*/().\s]+$/.test(stripped)) return null;

        const result = new Function('"use strict"; return (' + e + ')')();
        if (typeof result !== 'number' || !isFinite(result)) return null;
        return Math.abs(result - Math.round(result)) < 1e-9 ? Math.round(result) : result;
    } catch {
        return null;
    }
}

// ─── Word math → digits converter ─────────────────────────────────────────────
// Handles operators in words AND number words like "two nine nine" → 299
const WORD_MAP = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
    eighty: 80, ninety: 90, hundred: 100, thousand: 1000
};

// Convert a sequence of number words into a single number
// "two nine nine" → 299, "twenty one" → 21, "two hundred" → 200
function numberWordsToDigit(words) {
    // First try digit-by-digit reading (e.g. "two nine nine" = 299)
    const digitByDigit = words.map(w => {
        const val = WORD_MAP[w];
        return (val !== undefined && val <= 9) ? val : null;
    });
    if (digitByDigit.every(v => v !== null)) {
        return parseInt(digitByDigit.join(''), 10);
    }

    // Then try natural number reading (e.g. "twenty one" = 21, "two hundred" = 200)
    let total = 0;
    let current = 0;
    for (const word of words) {
        const val = WORD_MAP[word];
        if (val === undefined) return null;
        if (val === 100) {
            current = (current === 0 ? 1 : current) * 100;
        } else if (val === 1000) {
            total += (current === 0 ? 1 : current) * 1000;
            current = 0;
        } else {
            current += val;
        }
    }
    return total + current;
}

function wordMathToExpr(content) {
    let e = content.toLowerCase().trim()
        .replace(/\bplus\b/g, ' + ')
        .replace(/\bminus\b/g, ' - ')
        .replace(/\btimes\b/g, ' * ')
        .replace(/\bmultiplied by\b/g, ' * ')
        .replace(/\bdivided by\b/g, ' / ')
        .replace(/\bover\b/g, ' / ')
        .replace(/\bto the power of\b/g, ' ** ')
        .replace(/\bsquared\b/g, ' ** 2')
        .replace(/\bcubed\b/g, ' ** 3')
        .replace(/\bsquare root of\b/g, 'sqrt(')
        .replace(/\broot of\b/g, 'sqrt(')
        .replace(/\bsqrt of\b/g, 'sqrt(');

    // Now convert any remaining sequences of number words into digits
    // Split by operators and convert each segment's number words
    e = e.replace(/[a-z]+(?:\s+[a-z]+)*/g, (segment) => {
        const words = segment.trim().split(/\s+/).filter(Boolean);
        // Skip if all are already operator keywords we converted
        const num = numberWordsToDigit(words);
        return num !== null ? num : segment;
    });

    // Close any unclosed parens
    const openCount = (e.match(/\(/g) || []).length;
    const closeCount = (e.match(/\)/g) || []).length;
    if (openCount > closeCount) e += ')'.repeat(openCount - closeCount);

    return e;
}

function tryEvalMath(content) {
    // Direct expression (digits only)
    const direct = safeMath(content);
    if (direct !== null) return direct;

    // Word math conversion
    const converted = wordMathToExpr(content);
    if (converted !== content.toLowerCase().trim()) {
        const result = safeMath(converted);
        if (result !== null) return result;
    }

    return null;
}

// ─── Extract plain number from message ────────────────────────────────────────
function extractPlainNumber(content) {
    const trimmed = content.trim();
    if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
    const matches = trimmed.match(/\b(\d+)\b/g);
    if (matches) return parseInt(matches[0], 10);
    return null;
}

// ─── Check if message is asking about the count ───────────────────────────────
function isCountQuery(content) {
    const lower = content.toLowerCase().trim();
    const patterns = [
        /what('?s| is) the count/,
        /current count/,
        /where are we/,
        /what number/,
        /how far/,
        /whats the count/,
        /what count/,
        /where('?s| is) the count/,
    ];
    return patterns.some(p => p.test(lower));
}

// ─── AI: analyze message for number + suggest emoji ──────────────────────────
async function aiAnalyzeMessage(content, expectedCount) {
    const prompt = `You are analyzing a Discord counting game message. The expected next number is ${expectedCount}.

Message: "${content}"

Determine if this message evaluates to or contains the number ${expectedCount}.
This includes:
- Plain number or word form ("twenty" for 20)
- Number embedded in a sentence ("one of the ${expectedCount}")
- Math expressions using digits OR words OR mixed: "300 - two nine nine", "4 plus sixteen", "two hundred minus eighty"
  - Word digits like "two nine nine" mean 299 (each word is a digit: 2,9,9)
  - "twenty one" means 21
- Any valid expression that equals ${expectedCount}

If it equals ${expectedCount}, suggest ONE creative Discord emoji matching the message theme. Not ✅.
If it does NOT equal ${expectedCount}, return numberFound: false.

Respond ONLY with valid JSON:
{
  "numberFound": true or false,
  "suggestedEmoji": "🎯" or null
}`;

    try {
        const response = await hf.chatCompletion({
            model: "Qwen/Qwen2.5-Coder-32B-Instruct",
            messages: [
                { role: "system", content: "You are a precise math and message analyzer. Respond only with valid JSON." },
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
    const content = message.content.trim();

    // ── Count query ("what's the count?") ────────────────────────────────────
    if (isCountQuery(content)) {
        const current = data.currentCount;
        const next = current + 1;
        const lastUser = data.lastUsername ? `<@${data.lastUser}>` : 'nobody yet';
        await message.reply(
            `**Current count:** ${current} — last counted by ${lastUser}\n**Next number:** ${next}`
        );
        return;
    }

    const expected = data.currentCount + 1;

    // ── Fast path 1: message is ONLY a plain number ───────────────────────────
    if (/^\d+$/.test(content)) {
        const num = parseInt(content, 10);
        if (num === expected) {
            await message.react('✅').catch(() => { });
            data.currentCount = expected;
            data.lastUser = message.author.id;
            data.lastUsername = message.author.username;
            saveCountData(data);
        }
        return;
    }

    // ── Fast path 2: local math evaluator ────────────────────────────────────
    const mathResult = tryEvalMath(content);
    if (mathResult !== null) {
        if (mathResult === expected) {
            await message.react('✅').catch(() => { });
            data.currentCount = expected;
            data.lastUser = message.author.id;
            data.lastUsername = message.author.username;
            saveCountData(data);

            aiAnalyzeMessage(content, expected).then(async (aiResult) => {
                if (aiResult.suggestedEmoji) {
                    await message.react(aiResult.suggestedEmoji).catch(() => { });
                }
            }).catch(() => { });
        }
        return;
    }

    // ── Fast path 3: contains a plain number somewhere ────────────────────────
    const plainNum = extractPlainNumber(content);
    if (plainNum !== null) {
        if (plainNum === expected) {
            await message.react('✅').catch(() => { });
            data.currentCount = expected;
            data.lastUser = message.author.id;
            data.lastUsername = message.author.username;
            saveCountData(data);

            aiAnalyzeMessage(content, expected).then(async (aiResult) => {
                if (aiResult.suggestedEmoji) {
                    await message.react(aiResult.suggestedEmoji).catch(() => { });
                }
            }).catch(() => { });
        }
        return;
    }

    // ── Slow path: no digits — let AI handle it ───────────────────────────────
    const aiResult = await aiAnalyzeMessage(content, expected);
    if (aiResult.numberFound) {
        await message.react('✅').catch(() => { });
        data.currentCount = expected;
        data.lastUser = message.author.id;
        data.lastUsername = message.author.username;
        saveCountData(data);

        if (aiResult.suggestedEmoji) {
            await message.react(aiResult.suggestedEmoji).catch(() => { });
        }
    }
}

module.exports = { handleCountingMessage };

    // this is bs