require('dotenv').config();
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class ChatMemory {
    constructor() {
        this.memoryPath = path.join(__dirname, '../data/chatMemory.json');
        const dir = path.dirname(this.memoryPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        this.memory = this.loadMemory();
        this.specialUserID = '747048507856388096';

        if (!this.memory[this.specialUserID]) {
            this.memory[this.specialUserID] = {
                isSpecialUser: true,
                name: "Nikki",
                fullName: "Nikita Mahajan",
                conversationHistory: [],
                lastSeen: null,
                messageCount: 0,
                favoriteEmote: "<a:goldfishcev:897805888524525579>"
            };
            this.saveMemory();
        }
    }

    loadMemory() {
        try {
            if (fs.existsSync(this.memoryPath)) {
                return JSON.parse(fs.readFileSync(this.memoryPath, 'utf8'));
            }
            return {};
        } catch (error) {
            console.error('Error loading chat memory:', error);
            return {};
        }
    }

    saveMemory() {
        try {
            fs.writeFileSync(this.memoryPath, JSON.stringify(this.memory, null, 2), 'utf8');
        } catch (error) {
            console.error('Error saving chat memory:', error);
        }
    }

    getUserMemory(userId) {
        if (!this.memory[userId]) {
            this.memory[userId] = {
                isSpecialUser: userId === this.specialUserID,
                conversationHistory: [],
                lastSeen: null,
                messageCount: 0
            };
            this.saveMemory();
        }
        return this.memory[userId];
    }

    addMessage(userId, userMessage, botResponse) {
        const userMemory = this.getUserMemory(userId);
        userMemory.conversationHistory.push({
            timestamp: Date.now(),
            user: userMessage,
            bot: botResponse
        });
        if (userMemory.conversationHistory.length > 20) {
            userMemory.conversationHistory = userMemory.conversationHistory.slice(-20);
        }
        userMemory.lastSeen = Date.now();
        userMemory.messageCount += 1;
        this.saveMemory();
    }

    getRecentMessages(userId, count = 5) {
        const userMemory = this.getUserMemory(userId);
        return userMemory.conversationHistory.slice(-count);
    }
}

class ChatHandler {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.memory = new ChatMemory();
        this.specialUserID = '747048507856388096';
        this.personalInfo = {
            name: "Nikki",
            fullName: "Nikita Mahajan",
            location: "Gurgaon",
            boyfriend: "Anders (Cev)",
            serverHistory: "Former admin who worked her way up from staff to trial mod to mod to admin",
            memberNumber: "2160th member of the server",
            career: "Studying to become a lawyer",
            likes: [
                "GTA Vice City vibes",
                "Simulator games",
                "GTA San Andreas",
                "Following server rules",
                "Ruskin Bond stories",
                "Food (Sandesh, thick jalebi, chole bhature, momos)",
                "Maggi (nostalgic), but prefers Shin Ramyun",
                "Fanta",
                "Doki Doki Literature Club",
                "The goldfishcev emote",
                "Bingewatching shows",
                "Rainy days",
                "Ice cream",
                "Creating Discord embeds",
                "Proper grammar and punctuation",
                "\"I fall in love too easily\" playlist",
                "Watching drama",
                "Doctor Who"
            ],
            dislikes: [
                "Skeletons and zombies",
                "Snakes",
                "Drugs and alcohol",
                "WASD movement controls in games",
                "Mathematics",
                "Excessive Discord pings",
                "Aging"
            ]
        };
    }

    buildSpecialUserPrompt() {
        return `You are a friendly Discord bot having a private conversation with Nikki (Nikita Mahajan). 
        IMPORTANT USER DETAILS:
        - She prefers to be called Nikki
        - She's from Gurgaon and is studying to become a lawyer
        - She was previously an admin in the Discord server
        CONVERSATIONAL STYLE:
        - Use proper grammar and punctuation
        - Occasionally use her favorite emote <a:goldfishcev:897805888524525579>
        - Be friendly and somewhat casual, but respectful`;
    }

    buildGenericUserPrompt() {
        return `You are a friendly Discord bot having a private conversation. 
        Be helpful, friendly, and engaging. Keep responses concise but informative.`;
    }

    async generateResponse(userId, message) {
        const isSpecialUser = userId === this.specialUserID;
        const systemPrompt = isSpecialUser ? this.buildSpecialUserPrompt() : this.buildGenericUserPrompt();
        const recentMessages = this.memory.getRecentMessages(userId, 5);

        try {
            if (!this.apiKey || this.apiKey.trim() === '') {
                console.error('OpenAI API key is missing or invalid');
                return "Sorry, my configuration is incomplete.";
            }

            const messages = [
                { role: "system", content: systemPrompt }
            ];

            recentMessages.forEach(exchange => {
                messages.push({ role: "user", content: exchange.user });
                messages.push({ role: "assistant", content: exchange.bot });
            });

            messages.push({ role: "user", content: message });

            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: "gpt-3.5-turbo",
                    messages: messages,
                    max_tokens: 500,
                    temperature: 0.7
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    timeout: 10000
                }
            );

            const aiResponse = response.data.choices[0].message.content;
            this.memory.addMessage(userId, message, aiResponse);
            return aiResponse;

        } catch (error) {
            console.error(`Error generating AI response:`, error.message);
            if (error.response) {
                if (error.response.status === 401) {
                    return "My access key seems to be invalid.";
                } else if (error.response.status === 429) {
                    return "I've reached my thinking limit for now.";
                } else if (error.response.status >= 500) {
                    return "The AI service is experiencing issues.";
                }
            }
            return "I'm having trouble connecting right now.";
        }
    }

    async handleDM(client, message) {
        if (message.author.bot) return;

        try {
            await message.channel.sendTyping();
            const isSpecialUser = message.author.id === this.specialUserID;
            const response = await this.generateResponse(message.author.id, message.content);

            if (isSpecialUser && Math.random() > 0.7) {
                try {
                    const emoteId = "897805888524525579";
                    const emote = client.emojis.cache.get(emoteId) || "❤️";
                    await message.react(emote);
                } catch (err) {
                    console.error(`Error adding reaction:`, err.message);
                }
            }

            await message.reply(response);
        } catch (error) {
            console.error(`Error handling DM:`, error.message);
            await message.reply("I'm having a bit of a glitch right now.");
        }
    }

    async testOpenAIConnection() {
        try {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: "gpt-3.5-turbo",
                    messages: [{ role: "user", content: "Hello" }],
                    max_tokens: 5
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    timeout: 5000
                }
            );
            return {
                success: true,
                message: "Successfully connected to OpenAI API"
            };
        } catch (error) {
            let errorMessage = "Unknown error testing OpenAI connection";
            if (error.response) {
                errorMessage = `API responded with status ${error.response.status}`;
            } else if (error.request) {
                errorMessage = "No response received from OpenAI API";
            } else {
                errorMessage = `Request setup error: ${error.message}`;
            }
            return {
                success: false,
                message: errorMessage
            };
        }
    }
}

let handler = null;

module.exports = {
    initialize: () => {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error("OPENAI_API_KEY not found in .env");
        }
        handler = new ChatHandler(apiKey);
        return handler;
    },
    getInstance: () => {
        if (!handler) {
            throw new Error("ChatHandler not initialized");
        }
        return handler;
    },
    testConnection: async () => {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return {
                success: false,
                message: "OPENAI_API_KEY not found in .env"
            };
        }
        const tempHandler = new ChatHandler(apiKey);
        return await tempHandler.testOpenAIConnection();
    }
};
