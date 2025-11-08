const axios = require('axios');
const { HfInference } = require('@huggingface/inference');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 🧠 In-memory chat memory per user
const conversationMemory = new Map();

// Personality data file path
const PERSONALITY_FILE = path.join(__dirname, '../data/personalities.json');

// Use the same working model as Spectre AI
const HF_CHAT_MODEL = "Qwen/Qwen2.5-Coder-32B-Instruct";

// Hugging Face API key from .env
const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;

// Initialize HuggingFace client
let hf;
if (HF_API_KEY) {
    hf = new HfInference(HF_API_KEY);
}

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
 * Get personality context for a user (only current user, no info about others)
 */
function getUserContext(userId) {
    const personalities = loadPersonalities();

    let context = '';

    // Only add info about current user
    if (personalities[userId]) {
        const p = personalities[userId];
        context += `\n[CONTEXT: You are currently talking to ${p.name} (ID: ${userId}). About them: ${p.description}${p.notes ? `. Additional notes: ${p.notes}` : ''}]`;
    }

    // DO NOT include info about other people for privacy
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
    if (!HF_API_KEY || !hf) {
        return "❌ Missing Hugging Face API key in .env";
    }

    const memory = getUserMemory(userId);
    const userContext = getUserContext(userId);

    // Build system context
    let systemPrompt = `You are Spectre, a friendly and helpful Discord bot. You are conversational, witty, and keep responses concise (under 500 words). You answer questions, have conversations, and help users. You respect privacy and do not share information about other users.`;

    if (userContext) {
        systemPrompt += userContext;
    }

    // Build conversation history
    const messages = [
        { role: "system", content: systemPrompt }
    ];

    // Add recent conversation history (last 10 messages)
    const recentMemory = memory.slice(-10);
    messages.push(...recentMemory);

    // Add current message
    messages.push({ role: "user", content: userMessage });

    try {
        const response = await hf.chatCompletion({
            model: HF_CHAT_MODEL,
            messages: messages,
            max_tokens: 500,
            temperature: 0.7,
            top_p: 0.9
        });

        let replyText = response.choices[0].message.content;

        if (!replyText || replyText.trim() === '') {
            replyText = "🤔 I'm not sure how to respond to that.";
        }

        // Clean up response
        replyText = replyText.trim();

        // Limit length to Discord's 2000 character limit
        if (replyText.length > 2000) {
            replyText = replyText.substring(0, 1997) + '...';
        }

        // Save to memory
        memory.push({ role: "user", content: userMessage });
        memory.push({ role: "assistant", content: replyText });

        // Limit memory size (keep last 20 messages)
        if (memory.length > 20) {
            memory.splice(0, memory.length - 20);
        }

        return replyText;

    } catch (error) {
        console.error("Hugging Face Chatbot Error:", error);

        if (error.message.includes("503")) {
            return "⏳ My brain is waking up... Try again in 20 seconds!";
        }
        if (error.message.includes("429")) {
            return "🐌 Whoa, slow down! Too many requests. Try again in a minute.";
        }
        if (error.message.includes("401") || error.message.includes("403")) {
            return "🔑 Invalid API key. Contact the bot owner.";
        }

        return "🤖 I'm having trouble processing that right now. Try again!";
    }
}

module.exports = {
    getChatbotResponse,
    resetConversation,
    loadPersonalities,
    getUserContext
};