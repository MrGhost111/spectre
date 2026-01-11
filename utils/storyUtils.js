const { HfInference } = require('@huggingface/inference');
require('dotenv').config();

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

/**
 * Check if a story contains all required words using AI
 * @param {string} story - The story text to check
 * @param {string[]} requiredWords - Array of words that must be in the story
 * @returns {Promise<{valid: boolean, missingWords: string[], message: string}>}
 */
async function validateStoryWords(story, requiredWords) {
    const prompt = `You are a word validator. Check if the following story contains ALL of these required words (or their variations like plural, past tense, etc.):

Required words: ${requiredWords.join(', ')}

Story:
${story}

IMPORTANT RULES:
- Accept word variations (e.g., "castle" matches "castles", "run" matches "running/ran")
- Accept different forms (e.g., "create" matches "created/creating/creation")
- Words must appear in the story content, not just mentioned
- Be flexible with word forms but strict about presence

Respond ONLY with valid JSON:
{
  "allWordsFound": true/false,
  "foundWords": ["word1", "word2"],
  "missingWords": ["word3"],
  "explanation": "Brief explanation of what was found/missing"
}`;

    try {
        const response = await hf.chatCompletion({
            model: "Qwen/Qwen2.5-Coder-32B-Instruct",
            messages: [
                { role: "system", content: "You are a word validation assistant. Respond only with valid JSON." },
                { role: "user", content: prompt }
            ],
            max_tokens: 500,
            temperature: 0.1
        });

        const aiResponse = response.choices[0].message.content;
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);

        if (!jsonMatch) {
            throw new Error('Failed to parse AI response');
        }

        const result = JSON.parse(jsonMatch[0]);

        return {
            valid: result.allWordsFound,
            missingWords: result.missingWords || [],
            message: result.explanation || 'Validation complete'
        };

    } catch (error) {
        console.error('AI validation error:', error);

        // Fallback to simple validation if AI fails
        const storyLower = story.toLowerCase();
        const missingWords = requiredWords.filter(word => {
            const wordLower = word.toLowerCase();
            // Check for exact word or common variations
            const patterns = [
                new RegExp(`\\b${wordLower}\\b`, 'i'),
                new RegExp(`\\b${wordLower}s\\b`, 'i'),
                new RegExp(`\\b${wordLower}es\\b`, 'i'),
                new RegExp(`\\b${wordLower}ed\\b`, 'i'),
                new RegExp(`\\b${wordLower}ing\\b`, 'i'),
                new RegExp(`\\b${wordLower}d\\b`, 'i')
            ];
            return !patterns.some(pattern => pattern.test(story));
        });

        return {
            valid: missingWords.length === 0,
            missingWords: missingWords,
            message: missingWords.length === 0
                ? 'All words found!'
                : `Missing words: ${missingWords.join(', ')}`
        };
    }
}

/**
 * Generate a random anonymous author name
 * @returns {string}
 */
function generateAnonymousName() {
    const adjectives = [
        'Mysterious', 'Silent', 'Hidden', 'Ancient', 'Wandering', 'Lost', 'Forgotten',
        'Whispering', 'Dancing', 'Dreaming', 'Starlit', 'Moonlit', 'Shadow', 'Golden',
        'Silver', 'Crimson', 'Azure', 'Emerald', 'Violet', 'Cosmic', 'Ethereal',
        'Radiant', 'Twilight', 'Midnight', 'Dawn', 'Dusk', 'Frozen', 'Blazing'
    ];

    const nouns = [
        'Writer', 'Scribe', 'Poet', 'Author', 'Storyteller', 'Bard', 'Chronicler',
        'Wordsmith', 'Narrator', 'Sage', 'Oracle', 'Dreamer', 'Wanderer', 'Soul',
        'Spirit', 'Phoenix', 'Dragon', 'Raven', 'Owl', 'Fox', 'Wolf', 'Eagle',
        'Scholar', 'Muse', 'Seeker', 'Guardian', 'Keeper', 'Traveler'
    ];

    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const number = Math.floor(Math.random() * 999) + 1;

    return `${adj} ${noun} #${number}`;
}

module.exports = {
    validateStoryWords,
    generateAnonymousName
};