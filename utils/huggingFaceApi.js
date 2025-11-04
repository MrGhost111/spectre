const axios = require('axios');
require('dotenv').config();

// 🧠 In-memory chat memory (user-specific)
const conversationMemory = new Map();

// Pick your model here ↓
const HF_MODEL = "mistralai/Mixtral-8x7B-Instruct-v0.1";

// 🔑 Use your Hugging Face key from .env (variable: HUGGINGFACE_API_KEY)
const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;

// 🧩 Get or create user chat history
function getUserMemory(userId) {
    if (!conversationMemory.has(userId)) {
        conversationMemory.set(userId, []);
    }
    return conversationMemory.get(userId);
}

// 🧹 Reset chat for a user
function resetConversation(userId) {
    if (conversationMemory.has(userId)) {
        conversationMemory.delete(userId);
        return true;
    }
    return false;
}

// 💬 Send a message and get a response from Hugging Face
async function getChatbotResponse(userId, userMessage) {
    if (!HF_API_KEY) {
        console.error("❌ Missing HUGGINGFACE_API_KEY in your .env file!");
        return "My configuration is missing an API key — please contact the bot owner.";
    }

    const memory = getUserMemory(userId);
    memory.push({ role: "user", content: userMessage });

    try {
        const response = await axios.post(
            `https://api-inference.huggingface.co/models/${HF_MODEL}`,
            {
                inputs: {
                    past_user_inputs: memory.filter(m => m.role === "user").map(m => m.content),
                    generated_responses: memory.filter(m => m.role === "assistant").map(m => m.content),
                    text: userMessage
                },
                parameters: {
                    max_new_tokens: 250,
                    temperature: 0.7
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

        const data = response.data;
        let replyText =
            data.generated_text ||
            (Array.isArray(data) && data[0]?.generated_text) ||
            data?.[0]?.message ||
            null;

        if (!replyText) {
            console.warn("⚠️ Unexpected Hugging Face response:", data);
            replyText = "I'm not sure how to respond to that.";
        }

        memory.push({ role: "assistant", content: replyText });

        // Keep only last few turns to prevent memory bloat
        if (memory.length > 10) memory.shift();

        return replyText.trim();

    } catch (error) {
        console.error("Hugging Face API Error:", error.response?.data || error.message);

        if (error.message.includes("503")) return "Model is waking up... Try again in a few seconds!";
        if (error.message.includes("429")) return "Too many requests — slow down a bit!";
        if (error.message.includes("401") || error.message.includes("403"))
            return "Invalid or expired API key. Contact the bot owner.";

        return "I'm having trouble connecting to my model right now. Please try again soon.";
    }
}

module.exports = {
    getChatbotResponse,
    resetConversation
};
