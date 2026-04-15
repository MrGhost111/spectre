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
        if (!apiKey) {
            console.error('❌ [SpectreAI] GEMINI_KEY is missing in .env');
            return;
        }

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
        console.log(`[SpectreAI] Processing request from ${message.author.tag}: "${userMessage}"`);

        // 1. Permission Check
        if (message.author.id !== this.AUTHORIZED_USER_ID) {
            console.warn(`[SpectreAI] Permission Denied: Author ID ${message.author.id} does not match authorized ID.`);
            return { type: 'no_permission' };
        }

        // 2. Start Visual Feedback
        try {
            await message.channel.sendTyping();
        } catch (e) {
            console.error('[SpectreAI] Failed to send typing indicator:', e.message);
        }

        try {
            // 3. AI Generation
            console.log('[SpectreAI] Sending request to Gemini 2.5...');
            const result = await this.model.generateContent(userMessage);
            const responseText = result.response.text();

            if (!responseText) {
                throw new Error('AI returned an empty response.');
            }

            // 4. Send the response
            await message.reply(responseText);
            console.log('[SpectreAI] Success: Response sent to Discord.');

            // Return success to the handler
            return { type: 'success' };

        } catch (error) {
            console.error('[SpectreAI] Gemini 2.5 Error:', error);

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

// Export an INSTANCE of the class so mcreate.js can call .process() immediately
module.exports = new SpectreAI();