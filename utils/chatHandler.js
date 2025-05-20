// utils/chatHandler.js
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Store conversation history in memory with backup to file system
class ChatMemory {
    constructor() {
        this.memoryPath = path.join(__dirname, '../data/chatMemory.json');
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
            fs.mkdirSync(path.join(__dirname, '../data'), { recursive: true });
            fs.writeFileSync(this.memoryPath, '{}', 'utf8');
            return {};
        } catch (error) {
            // Log error to memory rather than console
            this.logError(`Error loading chat memory: ${error.message}`);
            return {};
        }
    }

    saveMemory() {
        try {
            fs.writeFileSync(this.memoryPath, JSON.stringify(this.memory, null, 2), 'utf8');
        } catch (error) {
            // Log error to memory rather than console
            this.logError(`Error saving chat memory: ${error.message}`);
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

    // Store errors for later sending to Discord
    logError(errorMessage) {
        if (!this.memory.errors) {
            this.memory.errors = [];
        }
        this.memory.errors.push({
            timestamp: Date.now(),
            message: errorMessage
        });
        // Keep the error log manageable
        if (this.memory.errors.length > 100) {
            this.memory.errors = this.memory.errors.slice(-100);
        }
        // Still try to save memory even though we're in an error state
        try {
            fs.writeFileSync(this.memoryPath, JSON.stringify(this.memory, null, 2), 'utf8');
        } catch (e) {
            // Cannot log or save - critical failure
        }
    }

    getErrors() {
        return this.memory.errors || [];
    }

    clearErrors() {
        this.memory.errors = [];
        this.saveMemory();
    }
}

class ChatHandler {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.memory = new ChatMemory();
        this.specialUserID = '747048507856388096'; // Nikita's user ID
        this.adminIDs = ['753491023208120321']; // Add your Discord ID here to receive error logs
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
                    }
                }
            );

            const aiResponse = response.data.choices[0].message.content;

            // Store this conversation
            this.memory.addMessage(userId, message, aiResponse);

            return aiResponse;

        } catch (error) {
            let errorMessage = 'Error generating AI response: ';

            if (error.response) {
                errorMessage += JSON.stringify(error.response.data);
            } else if (error.request) {
                errorMessage += 'No response received from API';
            } else {
                errorMessage += error.message;
            }

            // Log the error to memory
            this.memory.logError(errorMessage);

            // Send error logs to admin if this is an admin
            if (this.adminIDs.includes(userId)) {
                return `Error generating response: ${errorMessage}`;
            }

            return "I'm having trouble connecting to my thinking circuits right now. Could you try again in a moment?";
        }
    }

    async handleDM(client, message) {
        if (message.author.bot) return; // Ignore messages from bots

        try {
            // Show typing indicator
            await message.channel.sendTyping();

            const userId = message.author.id;

            // Special admin command to get error logs
            if (this.adminIDs.includes(userId) && message.content.toLowerCase() === '!errors') {
                const errors = this.memory.getErrors();
                if (errors.length === 0) {
                    await message.reply("No errors logged.");
                    return;
                }

                // Send last 10 errors as an embed
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('Error Logs')
                    .setDescription('Last 10 errors from the chat system');

                const recentErrors = errors.slice(-10);
                recentErrors.forEach((error, index) => {
                    const date = new Date(error.timestamp).toLocaleString();
                    embed.addFields({
                        name: `Error ${index + 1} - ${date}`,
                        value: error.message.substring(0, 1024)
                    });
                });

                await message.reply({ embeds: [embed] });
                return;
            }

            // Special admin command to clear error logs
            if (this.adminIDs.includes(userId) && message.content.toLowerCase() === '!clearerrors') {
                this.memory.clearErrors();
                await message.reply("Error logs cleared.");
                return;
            }

            // Check if it's our special user
            const isSpecialUser = message.author.id === this.specialUserID;

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
                    this.memory.logError(`Error adding reaction: ${err.message}`);
                    // Silently fail if reaction doesn't work
                }
            }

            // Send the response
            await message.reply(response);

        } catch (error) {
            this.memory.logError(`Error handling DM: ${error.message}`);
            try {
                await message.reply("I'm having a bit of a glitch right now. Please try again in a moment.");
            } catch (replyError) {
                this.memory.logError(`Failed to send error message: ${replyError.message}`);
            }
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

        try {
            handler = new ChatHandler(apiKey);
            return handler;
        } catch (error) {
            // Can't use memory logging here since it's not initialized yet
            console.error("Critical error initializing ChatHandler:", error);
            throw error;
        }
    },
    getInstance: () => {
        if (!handler) {
            throw new Error("ChatHandler not initialized. Call initialize() with an API key first.");
        }
        return handler;
    }
};