const fs = require('fs');
const path = require('path');

// Create a blacklist file path
const blacklistPath = path.join(__dirname, '../data/word_blacklist.json');

// Initialize blacklist if it doesn't exist
if (!fs.existsSync(blacklistPath)) {
    fs.writeFileSync(blacklistPath, JSON.stringify({
        "1346427004299378718": [] // One word story channel ID with empty blacklist initially
    }, null, 2), 'utf8');
}

/**
 * Checks if a message is valid for the one word story channel
 * @param {Object} message - Discord.js message object
 * @returns {Object} - Object containing isValid and reason
 */
async function checkOneWordMessage(message) {
    try {
        const blacklistData = JSON.parse(fs.readFileSync(blacklistPath, 'utf8'));
        const channelBlacklist = blacklistData[message.channelId] || [];

        // Check if message contains more than one word with punctuation handling
        const messageContent = message.content.trim();
        const words = messageContent.split(/\s+/);
        const wordCount = words.length;

        // Simple check: if we have 2 words, check if one is pure punctuation
        let isValidMessage = false;

        if (wordCount === 1) {
            // Single word is always valid (subject to blacklist)
            isValidMessage = true;
        } else if (wordCount === 2) {
            // Check if either word is pure punctuation
            const isPunctuation = (word) => /^[.,!?;:"'()\[\]{}…&-]+$/.test(word);

            if (isPunctuation(words[0]) || isPunctuation(words[1])) {
                isValidMessage = true;
            }
        }

        if (!isValidMessage) {
            return {
                isValid: false,
                reason: 'length',
                message: `<@${message.author.id}> Only one word is allowed in this channel! You can include standalone punctuation.`
            };
        }

        // Get the actual word (non-punctuation) for blacklist checking
        let wordToCheck = messageContent;
        if (wordCount === 2) {
            // Find which part is the actual word
            const isPunctuation = (word) => /^[.,!?;:"'()\[\]{}…&-]+$/.test(word);
            wordToCheck = isPunctuation(words[0]) ? words[1] : words[0];
        }

        // Enhanced blacklist check - check if any blacklisted word is contained within the message
        const wordLower = wordToCheck.toLowerCase();
        if (channelBlacklist.some(blacklistedWord => {
            // Check if the word contains any blacklisted word
            const blacklistedWordLower = blacklistedWord.toLowerCase();
            return wordLower.includes(blacklistedWordLower) ||
                // Or check if blacklisted word is a root of the current word
                (blacklistedWordLower.length > 3 && wordLower.startsWith(blacklistedWordLower));
        })) {
            return {
                isValid: false,
                reason: 'blacklisted',
                message: `<@${message.author.id}> That word is blacklisted in this channel.`
            };
        }

        return { isValid: true };
    } catch (error) {
        console.error('Error checking one word story:', error);
        return {
            isValid: false,
            reason: 'error',
            message: 'An error occurred while checking the message.'
        };
    }
}

/**
 * Handle blacklist management commands
 * @param {Object} message - Discord.js message object
 * @returns {Promise<boolean>} - True if a blacklist command was processed
 */
async function handleBlacklistCommand(message) {
    if (!message.content.startsWith(',blacklist')) {
        return false;
    }

    // Check permissions
    if (!(message.member.permissions.has('ManageMessages') || message.author.id === '753491023208120321')) {
        await message.reply('You do not have permission to manage the blacklist.');
        return true;
    }

    const args = message.content.slice(',blacklist'.length).trim().split(/ +/);
    const action = args[0]?.toLowerCase();
    const channelId = args[1] || '1346427004299378718'; // Default to one word story channel

    // Load current blacklist
    let blacklistData = {};
    try {
        blacklistData = JSON.parse(fs.readFileSync(blacklistPath, 'utf8'));
        if (!blacklistData[channelId]) {
            blacklistData[channelId] = [];
        }
    } catch (error) {
        console.error('Error loading blacklist:', error);
        blacklistData[channelId] = [];
    }

    if (action === 'add' && args.length > 2) {
        // Add words to blacklist
        const wordsToAdd = args.slice(2).join(' ').split(',').map(word => word.trim());

        for (const word of wordsToAdd) {
            if (word && !blacklistData[channelId].includes(word)) {
                blacklistData[channelId].push(word);
            }
        }

        fs.writeFileSync(blacklistPath, JSON.stringify(blacklistData, null, 2), 'utf8');
        message.reply(`Added ${wordsToAdd.length} word(s) to the blacklist for channel <#${channelId}>.`);
        return true;
    } else if (action === 'remove' && args.length > 2) {
        // Remove words from blacklist
        const wordsToRemove = args.slice(2).join(' ').split(',').map(word => word.trim());
        const initialCount = blacklistData[channelId].length;

        blacklistData[channelId] = blacklistData[channelId].filter(
            word => !wordsToRemove.includes(word)
        );

        fs.writeFileSync(blacklistPath, JSON.stringify(blacklistData, null, 2), 'utf8');
        message.reply(`Removed ${initialCount - blacklistData[channelId].length} word(s) from the blacklist for channel <#${channelId}>.`);
        return true;
    } else if (action === 'list') {
        // List blacklisted words
        if (blacklistData[channelId].length === 0) {
            message.reply(`No words are blacklisted in channel <#${channelId}>.`);
        } else {
            message.reply(`Blacklisted words in <#${channelId}>: ${blacklistData[channelId].join(', ')}`);
        }
        return true;
    } else if (action === 'clear') {
        // Clear all blacklisted words
        blacklistData[channelId] = [];
        fs.writeFileSync(blacklistPath, JSON.stringify(blacklistData, null, 2), 'utf8');
        message.reply(`Cleared the blacklist for channel <#${channelId}>.`);
        return true;
    } else {
        message.reply('Usage: `,blacklist [add/remove/list/clear] [channelId] [word1,word2,...]`');
        return true;
    }
}

module.exports = {
    checkOneWordMessage,
    handleBlacklistCommand
};