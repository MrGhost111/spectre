// conversationHandler.js
// This module handles the conversation state for the chatbot

const fs = require('fs');
const path = require('path');

// Store conversation history to provide context to the AI
// Format: { userId: [{ role: 'user|assistant', content: 'message' }] }
let conversations = {};

// Max number of messages to keep in history per user
const MAX_HISTORY_LENGTH = 10;

// Path to save conversation data
const CONVERSATIONS_PATH = path.join(__dirname, '../data/conversations.json');

// Load existing conversations from file
function loadConversations() {
    try {
        if (fs.existsSync(CONVERSATIONS_PATH)) {
            const data = fs.readFileSync(CONVERSATIONS_PATH, 'utf8');
            conversations = JSON.parse(data);
            console.log('Loaded conversation history from file');
        } else {
            console.log('No conversation history file found, starting fresh');
            conversations = {};
        }
    } catch (error) {
        console.error('Error loading conversations:', error);
        conversations = {};
    }
}

// Save conversations to file
function saveConversations() {
    try {
        // Create directory if it doesn't exist
        const dir = path.dirname(CONVERSATIONS_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(CONVERSATIONS_PATH, JSON.stringify(conversations, null, 2), 'utf8');
    } catch (error) {
        console.error('Error saving conversations:', error);
    }
}

// Add a message to the conversation history
function addMessage(userId, role, content) {
    if (!conversations[userId]) {
        conversations[userId] = [];
    }
    
    conversations[userId].push({ role, content });
    
    // Limit history size
    if (conversations[userId].length > MAX_HISTORY_LENGTH) {
        conversations[userId] = conversations[userId].slice(-MAX_HISTORY_LENGTH);
    }
    
    // Save after each update
    saveConversations();
}

// Get conversation history for a user
function getConversationHistory(userId) {
    return conversations[userId] || [];
}

// Format conversation history for Hugging Face API
function formatHistoryForHuggingFace(userId) {
    const history = getConversationHistory(userId);
    if (history.length === 0) {
        return "";
    }
    
    // Format depends on the specific model you're using
    // This is a simple format that works with many instruction-tuned models
    let formattedHistory = "";
    
    history.forEach(msg => {
        if (msg.role === 'user') {
            formattedHistory += `Human: ${msg.content}\n`;
        } else {
            formattedHistory += `Assistant: ${msg.content}\n`;
        }
    });
    
    return formattedHistory;
}

// Clear conversation history for a user
function clearConversation(userId) {
    if (conversations[userId]) {
        conversations[userId] = [];
        saveConversations();
        return true;
    }
    return false;
}

// Initialize by loading conversations
loadConversations();

module.exports = {
    addMessage,
    getConversationHistory,
    formatHistoryForHuggingFace,
    clearConversation
};
