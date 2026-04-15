const { GoogleGenerativeAI } = require('@google/generative-ai');
const { EmbedBuilder, Colors } = require('discord.js');
require('dotenv').config();

/**
 * SpectreAI - Gemini 2.5 
 * Designed to work with modular event handlers (like mcreate.js).
 */
class SpectreAI {
    constructor() {
        const apiKey = process.env.GEMINI_KEY;
        if (!apiKey) throw new Error('GEMINI_KEY is missing in .env');

        this.genAI = new GoogleGenerativeAI(apiKey);

        // Using the 2.5 Flash Preview model
        this.model = this.genAI.getGenerativeModel({
            model: "gemini-2.5-flash-preview-09-2025"
        });

        // Security: Your unique Discord ID
        this.AUTHORIZED_USER_ID = '753491023208120321';

        console.log('🚀 SpectreAI: System ready. Integration mode active.');
    }

    /**
     * The main processing method called by mcreate.js
     * @param {Object} message - The original Discord message object
     * @param {string} userMessage - The cleaned prompt (without 'spectre')
     */
    async process(message, userMessage) {
        // 1. Permission Check
        if (message.author.id !== this.AUTHORIZED_USER_ID) {
            console.warn(`[SpectreAI] Unauthorized attempt by ${message.author.id}`);
            return { type: 'no_permission' };
        }

        // 2. Start Visual Feedback
        await message.channel.sendTyping();

        try {
            // 3. AI Generation
            const result = await this.model.generateContent(userMessage);
            const responseText = result.response.text();

            // 4. Send the response (Simple text reply for this basic version)
            await message.reply(responseText);

            // Return success to the handler
            return { type: 'success' };

        } catch (error) {
            console.error('Gemini 2.5 Error:', error);

            // 5. Create error embed for mcreate.js to handle
            const errorEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ AI Error')
                .setDescription(error.message || 'An unexpected error occurred while talking to Gemini.');

            return {
                type: 'error',
                embed: errorEmbed
            };
        }
    }
}

module.exports = SpectreAI;