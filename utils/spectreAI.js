const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

/**
 * SpectreAI - Gemini 2.5 "Hello World" Version
 * The simplest possible implementation to test AI connectivity.
 */
class SpectreAI {
    constructor() {
        // 1. Setup API Connection
        const apiKey = process.env.GEMINI_KEY;
        this.genAI = new GoogleGenerativeAI(apiKey);

        // 2. Target the Gemini 2.5 Model
        this.model = this.genAI.getGenerativeModel({
            model: "gemini-2.5-flash-preview-09-2025"
        });

        // 3. Security: Only YOU can trigger this
        this.AUTHORIZED_USER_ID = '753491023208120321';

        console.log('🚀 SpectreAI: Gemini 2.5 Basic Mode Active.');
    }

    /**
     * The core logic: Message In -> AI -> Message Out
     */
    async handleMessage(message) {
        // Security Gate: Ignore everyone else
        if (message.author.id !== this.AUTHORIZED_USER_ID) return;

        // Visual feedback that the bot is "thinking"
        await message.channel.sendTyping();

        try {
            // Send the user's message text directly to the AI
            const result = await this.model.generateContent(message.content);
            const responseText = result.response.text();

            // Reply with the AI's output
            await message.reply(responseText);
        } catch (error) {
            console.error('Gemini Error:', error);
            await message.reply(`❌ Error: ${error.message}`);
        }
    }
}

module.exports = SpectreAI;