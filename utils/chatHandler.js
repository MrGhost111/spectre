const { EmbedBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

class ChatHandler {
    constructor() {
        this.apiKey = process.env.OPENAI_API_KEY;
        this.rateLimits = new Map(); // User-based rate limiting
        this.globalCooldown = 1000; // 1 second between requests globally
        this.lastGlobalRequest = 0;
    }

    async generateResponse(userId, message) {
        // Global rate limiting
        const now = Date.now();
        const globalWait = Math.max(0, this.globalCooldown - (now - this.lastGlobalRequest));
        
        // User-based rate limiting
        if (!this.rateLimits.has(userId)) {
            this.rateLimits.set(userId, {
                lastRequest: 0,
                cooldown: 1500 // 1.5s per user initially
            });
        }
        const userLimit = this.rateLimits.get(userId);
        const userWait = Math.max(0, userLimit.cooldown - (now - userLimit.lastRequest));

        // Wait for the longer of the two limits
        const waitTime = Math.max(globalWait, userWait);
        if (waitTime > 0) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        try {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: "gpt-3.5-turbo",
                    messages: [{
                        role: "system",
                        content: "You are a helpful assistant. Keep responses concise and Discord-friendly."
                    }, {
                        role: "user",
                        content: message
                    }],
                    max_tokens: 500,
                    temperature: 0.7
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    timeout: 15000
                }
            );

            // Update rate limits
            this.lastGlobalRequest = Date.now();
            userLimit.lastRequest = Date.now();
            
            return response.data.choices[0].message.content;

        } catch (error) {
            // Handle rate limits
            if (error.response?.status === 429) {
                // Increase user cooldown exponentially
                userLimit.cooldown = Math.min(userLimit.cooldown * 2, 10000); // Max 10s
                return "I'm getting too many requests. Please wait a moment before trying again.";
            }
            
            console.error('OpenAI API Error:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            
            return "I'm experiencing technical difficulties. Please try again later.";
        }
    }
}

module.exports = new ChatHandler();
