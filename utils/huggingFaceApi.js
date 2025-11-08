const axios = require('axios');
require('dotenv').config();

// 🧠 In-memory chat memory per user
const conversationMemory = new Map();

// Default model for chat & code generation
const HF_CHAT_MODEL = "mistralai/Mixtral-8x7B-Instruct-v0.1";
const HF_ACTION_MODEL = "Qwen/Qwen2.5-Coder-32B-Instruct";

// Hugging Face API key from .env
const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;

function getUserMemory(userId) {
    if (!conversationMemory.has(userId)) conversationMemory.set(userId, []);
    return conversationMemory.get(userId);
}

function resetConversation(userId) {
    if (conversationMemory.has(userId)) {
        conversationMemory.delete(userId);
        return true;
    }
    return false;
}

async function getChatbotResponse(userId, userMessage) {
    if (!HF_API_KEY) return "❌ Missing Hugging Face API key in .env";

    const memory = getUserMemory(userId);
    memory.push({ role: "user", content: userMessage });

    try {
        const response = await axios.post(
            `https://api-inference.huggingface.co/models/${HF_CHAT_MODEL}`,
            {
                inputs: {
                    past_user_inputs: memory.filter(m => m.role === "user").map(m => m.content),
                    generated_responses: memory.filter(m => m.role === "assistant").map(m => m.content),
                    text: userMessage
                },
                parameters: { max_new_tokens: 250, temperature: 0.7 }
            },
            { headers: { Authorization: `Bearer ${HF_API_KEY}`, "Content-Type": "application/json" }, timeout: 20000 }
        );

        let replyText =
            response.data.generated_text ||
            (Array.isArray(response.data) && response.data[0]?.generated_text) ||
            response.data?.[0]?.message ||
            null;

        if (!replyText) replyText = "🤔 I'm not sure how to respond.";

        memory.push({ role: "assistant", content: replyText });
        if (memory.length > 10) memory.shift(); // limit memory size
        return replyText.trim();

    } catch (error) {
        console.error("Hugging Face API Error:", error.response?.data || error.message);
        if (error.message.includes("503")) return "Model is waking up... Try again in a few seconds!";
        if (error.message.includes("429")) return "Too many requests — slow down a bit!";
        if (error.message.includes("401") || error.message.includes("403"))
            return "Invalid or expired API key. Contact the bot owner.";
        return "tf is that? doesn't look like a valid discord action request to me";
    }
}

async function generateCode(prompt) {
    if (!HF_API_KEY) throw new Error("Missing Hugging Face API key");

    try {
        const response = await axios.post(
            `https://api-inference.huggingface.co/models/${HF_ACTION_MODEL}`,
            { inputs: prompt },
            { headers: { Authorization: `Bearer ${HF_API_KEY}`, "Content-Type": "application/json" }, timeout: 30000 }
        );

        const text =
            response.data.generated_text ||
            (Array.isArray(response.data) && response.data[0]?.generated_text) ||
            response.data?.[0]?.message ||
            "";

        return text;
    } catch (error) {
        console.error("Hugging Face code generation error:", error.response?.data || error.message);
        throw new Error("Failed to generate code from AI");
    }
}

module.exports = {
    getChatbotResponse,
    resetConversation,
    generateCode
};
