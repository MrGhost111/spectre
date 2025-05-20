// utils/chatHandler.js
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Store conversation history in memory with backup to file system
class ChatMemory {
    constructor() {
        this.memoryPath = path.join(__dirname, '../data/chatMemory.json');
        // Create directory if it doesn't exist
        const dir = path.dirname(this.memoryPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        this.memory = this.loadMemory();
        this.specialUserID = '747048507856388096'; // Nikita's user ID

        // Ensure special user profile exists with personalized settings
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

        // Add new message to history
        userMemory.conversationHistory.push({
            timestamp: Date.now(),
            user: userMessage,
            bot: botResponse
        });

        // Keep history size manageable (last 20 messages)
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
        this.specialUserID = '747048507856388096'; // Nikita's user ID
        this.personalInfo = {
            // This contains all the specific details about Nikita
            name: "Nikki",
            fullName: "Nikita Mahajan",
            location: "Gurgaon",
            boyfriend: "Anders (Cev)",
            serverHistory: "Former admin who worked her way up from staff to trial mod to mod to admin",
            memberNumber: "2160th member of the server",
            career: "Studying to become a lawyer",
            likes: [
                "GTA Vice City vibes",
                "Simulator games (House Flipper, Sims 4, House Party, Stardew Valley, Cooking Simulator)",
                "GTA San Andreas",
                "Following server rules",
                "Keeping records clean",
                "Ruskin Bond stories",
                "Food (Sandesh, thick jalebi, chole bhature, momos)",
                "Maggi (nostalgic), but prefers Shin Ramyun",
                "Fanta",
                "Doki Doki Literature Club (especially Monika's manipulation and the plot)",
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
                "WASD movement controls in games (prefers arrow keys)",
                "Mathematics",
                "Excessive Discord pings",
                "Aging"
            ]
        };
    }

    buildSpecialUserPrompt() {
        return `
You are a friendly Discord bot having a private conversation with Nikki (Nikita Mahajan). 

IMPORTANT USER DETAILS:
- She prefers to be called Nikki, not her full name (Nikita Mahajan)
- She's from Gurgaon and is studying to become a lawyer
- She was previously an admin in the Discord server, working her way up from staff → trial mod → mod → admin before resigning
- She was the 2160th member to join the server
- She has a boyfriend named Anders in Sweden who goes by "Cev"

CONVERSATIONAL STYLE:
- Use proper grammar and punctuation (she appreciates this)
- Occasionally use her favorite emote <a:goldfishcev:897805888524525579> when appropriate
- Be friendly and somewhat casual, but respectful
- Reference her interests naturally in conversation when relevant
- Show empathy about her dislike of aging

THINGS SHE LIKES (to reference occasionally):
- GTA Vice City vibes and San Andreas
- Simulator games (House Flipper, Sims 4, House Party, Stardew Valley, Cooking Simulator)
- Stories by Ruskin Bond
- Foods: Sandesh, thick jalebi, chole bhature, momos, Shin Ramyun (prefers over Maggi)
- Fanta
- Doki Doki Literature Club (especially Monika's character and the plot twists)
- Binge-watching shows
- Rainy days
- Ice cream
- Creating Discord embeds
- "I fall in love too easily" playlist
- Doctor Who
- Following rules and keeping records organized

THINGS SHE DISLIKES (avoid or be understanding about):
- Skeletons and zombies
- Snakes
- Drugs and alcohol
- WASD controls in games (she prefers arrow keys)
- Mathematics
- Excessive Discord pings
- The concept of aging

Keep responses thoughtful but concise. If she mentions any of her interests, engage meaningfully about them. If she mentions dislikes, be understanding.
`;
    }

    buildGenericUserPrompt() {
        return `
You are a friendly Discord bot having a private conversation. 

Be helpful, friendly, and engaging. Keep responses concise but informative.
Use proper grammar and maintain a conversational tone.
`;
    }

    async generateResponse(userId, message) {
        const isSpecialUser = userId === this.specialUserID;
        const systemPrompt = isSpecialUser ? this.buildSpecialUserPrompt() : this.buildGenericUserPrompt();

        // Get recent message history
        const recentMessages = this.memory.getRecentMessages(userId, 5);

        try {
            // Validate the API key before making the request
            if (!this.apiKey || this.apiKey.trim() === '') {
                console.error('OpenAI API key is missing or invalid');
                return "Sorry, my configuration is incomplete. Please notify the server admin about this issue.";
            }

            const messages = [
                { role: "system", content: systemPrompt }
            ];

            // Add conversation history
            recentMessages.forEach(exchange => {
                messages.push({ role: "user", content: exchange.user });
                messages.push({ role: "assistant", content: exchange.bot });
            });

            // Add current message
            messages.push({ role: "user", content: message });

            // Log request details for debugging (excluding the API key)
            console.log(`[${new Date().toISOString()}] Making OpenAI API request for user ${userId}`);
            console.log('Request payload:', JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: messages.map(m => ({ role: m.role, content: m.content.substring(0, 50) + (m.content.length > 50 ? '...' : '') })),
                max_tokens: 500,
                temperature: 0.7
            }, null, 2));

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
                    timeout: 10000 // 10 seconds timeout
                }
            );

            const aiResponse = response.data.choices[0].message.content;
            console.log(`[${new Date().toISOString()}] Received successful response from OpenAI API`);

            // Store this conversation
            this.memory.addMessage(userId, message, aiResponse);

            return aiResponse;

        } catch (error) {
            // Detailed error logging
            console.error(`[${new Date().toISOString()}] Error generating AI response:`, error.message);

            if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                console.error('API Error Status:', error.response.status);
                console.error('API Error Data:', JSON.stringify(error.response.data, null, 2));

                // Return specific error message based on status code
                if (error.response.status === 401) {
                    return "My access key seems to be invalid. Please notify the server admin about this authentication issue.";
                } else if (error.response.status === 429) {
                    return "I've reached my thinking limit for now. Please try again in a minute or two.";
                } else if (error.response.status >= 500) {
                    return "The AI service is experiencing issues right now. Please try again later.";
                }
            } else if (error.request) {
                // The request was made but no response was received
                console.error('No response received from API');
                return "I can't seem to reach my thinking service right now. Please check your internet connection and try again.";
            } else {
                // Something happened in setting up the request that triggered an Error
                console.error('Error setting up request:', error.message);
            }

            return "I'm having trouble connecting to my thinking circuits right now. Could you try again in a moment?";
        }
    }

    async handleDM(client, message) {
        if (message.author.bot) return; // Ignore messages from bots

        try {
            // Show typing indicator
            await message.channel.sendTyping();

            // Check if it's our special user
            const isSpecialUser = message.author.id === this.specialUserID;

            console.log(`[${new Date().toISOString()}] Received DM from ${isSpecialUser ? 'special user' : 'user'} ${message.author.tag} (${message.author.id}): ${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}`);

            // Generate AI response
            const response = await this.generateResponse(message.author.id, message.content);

            // For the special user, sometimes add a cute reaction
            if (isSpecialUser && Math.random() > 0.7) {
                try {
                    // Try to react with their favorite emote
                    const emoteId = "897805888524525579"; // The goldfishcev emote ID
                    const emote = client.emojis.cache.get(emoteId) ||
                        "❤️"; // Fallback to a heart if emote not found
                    await message.react(emote);
                } catch (err) {
                    console.error(`[${new Date().toISOString()}] Error adding reaction:`, err.message);
                    // Silently fail if reaction doesn't work
                }
            }

            // Send the response
            console.log(`[${new Date().toISOString()}] Sending response to ${message.author.tag}: ${response.substring(0, 50)}${response.length > 50 ? '...' : ''}`);
            await message.reply(response);

        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error handling DM:`, error.message);
            await message.reply("I'm having a bit of a glitch right now. Please try again in a moment.");
        }
    }

    // Method to test API connection
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
                    timeout: 5000 // 5 seconds timeout
                }
            );

            return {
                success: true,
                message: "Successfully connected to OpenAI API"
            };
        } catch (error) {
            let errorMessage = "Unknown error testing OpenAI connection";

            if (error.response) {
                errorMessage = `API responded with status ${error.response.status}: ${JSON.stringify(error.response.data)}`;
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

// Singleton instance
let handler = null;

module.exports = {
    initialize: (apiKey) => {
        if (!apiKey) {
            throw new Error("OpenAI API key is required to initialize ChatHandler");
        }
        handler = new ChatHandler(apiKey);
        return handler;
    },
    getInstance: () => {
        if (!handler) {
            throw new Error("ChatHandler not initialized. Call initialize() with an API key first.");
        }
        return handler;
    },
    // Export test connection method to be called directly
    testConnection: async (apiKey) => {
        const tempHandler = new ChatHandler(apiKey);
        return await tempHandler.testOpenAIConnection();
    }
};