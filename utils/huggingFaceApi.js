const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 🧠 In-memory chat memory per user
const conversationMemory = new Map();

// Personality data file path
const PERSONALITY_FILE = path.join(__dirname, '../data/personalities.json');

// Default model for chat
const HF_CHAT_MODEL = "mistralai/Mixtral-8x7B-Instruct-v0.1";

// Hugging Face API key from .env
const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;

/**
 * Load personality data from JSON file
 */
function loadPersonalities() {
    try {
        if (!fs.existsSync(PERSONALITY_FILE)) {
            // Create default file if doesn't exist
            const defaultData = {
                "example_user_id": {
                    "name": "Example User",
                    "description": "A friendly person who loves coding and Discord bots",
                    "notes": "Always asks about JavaScript tips"
                }
            };
            fs.writeFileSync(PERSONALITY_FILE, JSON.stringify(defaultData, null, 2), 'utf8');
            return defaultData;
        }
        return JSON.parse(fs.readFileSync(PERSONALITY_FILE, 'utf8'));
    } catch (error) {
        console.error('Error loading personalities:', error);
        return {};
    }
}

/**
 * Get personality context for a user (includes all personalities)
 */
function getUserContext(userId, includeAll = true) {
    const personalities = loadPersonalities();

    let context = '';

    // Add info about current user
    if (personalities[userId]) {
        const p = personalities[userId];
        context += `\n[CONTEXT: You are currently talking to ${p.name} (ID: ${userId}). About them: ${p.description}${p.notes ? `. Additional notes: ${p.notes}` : ''}]`;
    }

    // Add info about other people if includeAll is true
    if (includeAll) {
        const otherPeople = Object.entries(personalities)
            .filter(([id]) => id !== userId)
            .map(([id, p]) => `${p.name} (ID: ${id}): ${p.description}`)
            .slice(0, 10); // Limit to 10 people to avoid token overload

        if (otherPeople.length > 0) {
            context += `\n[KNOWN PEOPLE: You also know about these people: ${otherPeople.join('; ')}]`;
        }
    }

    return context;
}

/**
 * Get user conversation memory
 */
function getUserMemory(userId) {
    if (!conversationMemory.has(userId)) {
        conversationMemory.set(userId, []);
    }
    return conversationMemory.get(userId);
}

/**
 * Reset conversation for a user
 */
function resetConversation(userId) {
    if (conversationMemory.has(userId)) {
        conversationMemory.delete(userId);
        return true;
    }
    return false;
}

/**
 * Get chatbot response with personality awareness
 */
async function getChatbotResponse(userId, userMessage, userName = 'User') {
    if (!HF_API_KEY) {
        return "❌ Missing Hugging Face API key in .env";
    }

    const memory = getUserMemory(userId);
    const userContext = getUserContext(userId);

    // Build system context
    let systemPrompt = `You are Spectre, a friendly and helpful Discord bot assistant. You are conversational, witty, and concise. Keep responses under 2000 characters.`;

    if (userContext) {
        systemPrompt += userContext;
    }

    // Add system prompt on first message
    if (memory.length === 0) {
        memory.push({ role: "system", content: systemPrompt });
    }

    memory.push({ role: "user", content: userMessage });

    try {
        // Build conversation history for the API
        const conversationText = memory
            .filter(m => m.role !== 'system')
            .map(m => `${m.role === 'user' ? userName : 'Spectre'}: ${m.content}`)
            .join('\n');

        const fullPrompt = `${systemPrompt}\n\nConversation:\n${conversationText}\nSpectre:`;

        const response = await axios.post(
            `https://api-inference.huggingface.co/models/${HF_CHAT_MODEL}`,
            {
                inputs: fullPrompt,
                parameters: {
                    max_new_tokens: 300,
                    temperature: 0.8,
                    top_p: 0.9,
                    repetition_penalty: 1.2,
                    return_full_text: false
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${HF_API_KEY}`,
                    "Content-Type": "application/json"
                },
                timeout: 20000
            }
        );

        let replyText = response.data[0]?.generated_text ||
            response.data.generated_text ||
            null;

        if (!replyText || replyText.trim() === '') {
            replyText = "🤔 I'm not sure how to respond to that.";
        }

        // Clean up response
        replyText = replyText.trim();

        // Remove if it repeats the prompt
        if (replyText.startsWith('Spectre:')) {
            replyText = replyText.substring(8).trim();
        }

        // Limit length
        if (replyText.length > 2000) {
            replyText = replyText.substring(0, 1997) + '...';
        }

        memory.push({ role: "assistant", content: replyText });

        // Limit memory size (keep last 20 messages + system prompt)
        if (memory.length > 21) {
            const systemMsg = memory[0];
            memory.splice(0, memory.length - 20);
            if (systemMsg.role === 'system') {
                memory.unshift(systemMsg);
            }
        }

        return replyText;

    } catch (error) {
        console.error("Hugging Face API Error:", error.response?.data || error.message);

        if (error.message.includes("503")) {
            return "⏳ My brain is waking up... Try again in 20 seconds!";
        }
        if (error.message.includes("429")) {
            return "🐌 Whoa, slow down! Too many requests. Try again in a minute.";
        }
        if (error.message.includes("401") || error.message.includes("403")) {
            return "🔑 Invalid API key. Contact the bot owner.";
        }
        if (error.code === 'ECONNABORTED') {
            return "⏱️ Request timed out. The model might be overloaded. Try again!";
        }

        return "🤖 I'm having trouble connecting to my brain right now. Try again later!";
    }
}

module.exports = {
    getChatbotResponse,
    resetConversation,
    loadPersonalities,
    getUserContext
};