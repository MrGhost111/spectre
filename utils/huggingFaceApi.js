// huggingFaceApi.js
// Handles interactions with the Hugging Face API

const axios = require('axios');
require('dotenv').config();
const conversationHandler = require('./conversationHandler');

// Configure the API endpoint and model
const HF_MODEL = process.env.HF_MODEL || 'mistralai/Mistral-7B-Instruct-v0.2';
const HF_API_URL = `https://api-inference.huggingface.co/models/${HF_MODEL}`;

/**
 * Get a response from the Hugging Face API
 * @param {string} userId - The Discord user ID
 * @param {string} message - The user's message
 * @returns {Promise<string>} - The AI's response
 */
async function getChatbotResponse(userId, message) {
    try {
        // Add the new message to conversation history
        conversationHandler.addMessage(userId, 'user', message);
        
        // Get conversation context
        const conversationContext = conversationHandler.formatHistoryForHuggingFace(userId);
        
        // Prepare the prompt with conversation history
        let prompt = "";
        if (conversationContext) {
            prompt = `${conversationContext}Human: ${message}\nAssistant:`;
        } else {
            prompt = `Human: ${message}\nAssistant:`;
        }

        // Call the Hugging Face API
        const response = await axios({
            method: 'post',
            url: HF_API_URL,
            headers: {
                'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
                'Content-Type': 'application/json',
            },
            data: {
                inputs: prompt,
                parameters: {
                    max_new_tokens: 250,
                    temperature: 0.7,
                    top_p: 0.95,
                    do_sample: true,
                    return_full_text: false // We only want the generated response, not the full conversation
                }
            },
            timeout: 60000 // 60 seconds timeout
        });

        // Extract and clean the response
        let aiResponse = "";
        if (response.data && response.data[0] && response.data[0].generated_text) {
            aiResponse = response.data[0].generated_text.trim();
            
            // Clean up model-specific formatting if needed
            aiResponse = aiResponse
                .replace(/^(\[INST\]|\[\/INST\]|\<s\>|\<\/s\>)/, '')
                .replace(/^Assistant:/, '')
                .trim();
            
            // If empty response after cleaning, provide a default
            if (!aiResponse) {
                aiResponse = "I'm not sure how to respond to that.";
            }
        } else {
            aiResponse = "Sorry, I couldn't generate a response at the moment.";
        }
        
        // Add the response to conversation history
        conversationHandler.addMessage(userId, 'assistant', aiResponse);
        
        return aiResponse;
    } catch (error) {
        console.error('Error calling Hugging Face API:', error.message);
        
        // Provide more specific error messages based on the error type
        if (error.response) {
            if (error.response.status === 503) {
                return "The AI model is currently loading. Please try again in a few moments.";
            } else if (error.response.status === 429) {
                return "I've received too many requests. Please try again later.";
            } else {
                console.error('API Error Response:', error.response.data);
                return "Sorry, I encountered an API error while trying to respond.";
            }
        } else if (error.request) {
            // Request was made but no response was received
            return "Sorry, I couldn't reach my thinking brain. Please try again later.";
        } else {
            // Something happened in setting up the request
            return "Sorry, I encountered an error while processing your message.";
        }
    }
}

/**
 * Reset the conversation history for a user
 * @param {string} userId - The Discord user ID
 * @returns {boolean} - Success status
 */
function resetConversation(userId) {
    return conversationHandler.clearConversation(userId);
}

module.exports = {
    getChatbotResponse,
    resetConversation
};
