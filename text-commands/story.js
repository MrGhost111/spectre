const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { HfInference } = require('@huggingface/inference');
require('dotenv').config();

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
const dataPath = path.join(__dirname, '../data/storyGame.json');

// Initialize story game data file if it doesn't exist
if (!fs.existsSync(dataPath)) {
    const initialData = {
        active: false,
        words: [],
        submissions: {},
        votes: {},
        guildId: null,
        channelId: null,
        theme: null
    };
    fs.writeFileSync(dataPath, JSON.stringify(initialData, null, 2), 'utf8');
}

// Default/general word categories (used when no theme provided)
const defaultWordSets = {
    nouns: [
        'castle', 'dragon', 'wizard', 'forest', 'ocean', 'mountain', 'treasure', 'sword',
        'crown', 'kingdom', 'village', 'knight', 'phoenix', 'storm', 'shadow', 'light',
        'moon', 'star', 'river', 'bridge', 'tower', 'garden', 'clock', 'mirror',
        'book', 'key', 'door', 'window', 'flame', 'ice', 'wind', 'earth',
        'destiny', 'journey', 'adventure', 'mystery', 'secret', 'whisper', 'echo', 'dream'
    ],
    verbs: [
        'discover', 'create', 'destroy', 'protect', 'escape', 'chase', 'hide', 'reveal',
        'transform', 'conquer', 'surrender', 'rise', 'fall', 'dance', 'sing', 'whisper',
        'shatter', 'mend', 'forge', 'break', 'build', 'explore', 'wander', 'seek'
    ],
    adjectives: [
        'ancient', 'mysterious', 'magical', 'forgotten', 'eternal', 'broken', 'golden', 'silver',
        'dark', 'bright', 'hidden', 'lost', 'found', 'wild', 'tame', 'fierce',
        'gentle', 'powerful', 'weak', 'beautiful', 'ugly', 'strange', 'familiar', 'distant'
    ],
    concepts: [
        'time', 'space', 'courage', 'fear', 'love', 'hatred', 'hope', 'despair',
        'freedom', 'captivity', 'truth', 'lies', 'peace', 'war', 'silence', 'chaos',
        'harmony', 'discord', 'wisdom', 'folly', 'justice', 'revenge', 'mercy', 'fate'
    ]
};

/**
 * Generate 5 themed words using AI
 * @param {string} theme - The theme for word generation
 * @returns {Promise<string[]>} Array of 5 words
 */
async function generateThemedWords(theme) {
    const prompt = `Generate exactly 5 creative words related to the theme: "${theme}"

Requirements:
- Words should be diverse and interesting for creative writing
- Include a mix of: nouns, verbs, adjectives, or concepts
- Words should inspire storytelling
- Avoid overly complex or obscure words
- Make them relevant to the theme but varied enough to be interesting

Respond ONLY with valid JSON in this exact format:
{
  "words": ["word1", "word2", "word3", "word4", "word5"],
  "theme": "${theme}"
}`;

    try {
        const response = await hf.chatCompletion({
            model: "Qwen/Qwen2.5-Coder-32B-Instruct",
            messages: [
                { role: "system", content: "You are a creative word generator. Respond only with valid JSON containing exactly 5 words." },
                { role: "user", content: prompt }
            ],
            max_tokens: 300,
            temperature: 0.7
        });

        const aiResponse = response.choices[0].message.content;
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);

        if (!jsonMatch) {
            throw new Error('Failed to parse AI response');
        }

        const result = JSON.parse(jsonMatch[0]);

        if (!result.words || result.words.length !== 5) {
            throw new Error('AI did not return exactly 5 words');
        }

        return result.words;

    } catch (error) {
        console.error('AI word generation error:', error);
        
        // Fallback to random words if AI fails
        console.log('Using fallback random word generation');
        return generateRandomWords();
    }
}

/**
 * Generate 5 random words (fallback when no theme or AI fails)
 * @returns {string[]} Array of 5 words
 */
function generateRandomWords() {
    const categories = Object.keys(defaultWordSets);
    const selectedWords = [];

    // Ensure at least one word from each major category
    const mustHave = ['nouns', 'verbs', 'adjectives'];
    
    for (const category of mustHave) {
        if (defaultWordSets[category]) {
            const words = defaultWordSets[category];
            const randomWord = words[Math.floor(Math.random() * words.length)];
            selectedWords.push(randomWord);
        }
    }

    // Fill remaining slots with random words from any category
    while (selectedWords.length < 5) {
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        const words = defaultWordSets[randomCategory];
        const randomWord = words[Math.floor(Math.random() * words.length)];
        
        // Avoid duplicates
        if (!selectedWords.includes(randomWord)) {
            selectedWords.push(randomWord);
        }
    }

    // Shuffle the array
    return selectedWords.sort(() => Math.random() - 0.5);
}

module.exports = {
    name: 'story',
    description: 'Start a story writing game with 5 random words',
    async execute(message, args) {
        const storyData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

        // Check if a game is already active
        if (storyData.active) {
            return message.reply('⚠️ A story game is already active! Wait for it to finish or use the "Finish & Announce" button.');
        }

        // Get theme from args (if provided)
        const theme = args.length > 0 ? args.join(' ') : null;

        // Send initial "generating" message
        const generatingMsg = await message.channel.send('🎲 Generating words' + (theme ? ` for theme: **${theme}**...` : '...'));

        let words;
        try {
            // Generate words based on theme (or random if no theme)
            if (theme) {
                words = await generateThemedWords(theme);
            } else {
                words = generateRandomWords();
            }
        } catch (error) {
            console.error('Error generating words:', error);
            await generatingMsg.edit('❌ Failed to generate words. Please try again.');
            return;
        }

        // Delete generating message
        await generatingMsg.delete().catch(() => {});

        // Save game state
        storyData.active = true;
        storyData.words = words;
        storyData.submissions = {};
        storyData.votes = {};
        storyData.guildId = message.guild.id;
        storyData.channelId = message.channel.id;
        storyData.theme = theme;
        fs.writeFileSync(dataPath, JSON.stringify(storyData, null, 2), 'utf8');

        // Create embed
        const embed = new EmbedBuilder()
            .setColor(theme ? '#FF69B4' : '#FFD700')
            .setTitle(`📖 Story Writing Challenge!${theme ? ` 🎨` : ''}`)
            .setDescription(`${theme ? `**Theme:** ${theme.charAt(0).toUpperCase() + theme.slice(1)}\n\n` : ''}Create a story using **ALL** of these 5 words:\n\n${words.map(w => `**${w}**`).join(' • ')}\n\n**How to participate:**\n1. Write a creative story including all 5 words\n2. Send your story to me via **DM** (Direct Message)\n3. You can edit your submission by editing your DM or sending a new message\n4. Latest submission will be considered\n5. Wait for voting to begin!\n\n**Rules:**\n• Use all 5 words in your story\n• Stories must be at least 50 characters\n• One submission per person (can be updated)\n• Voting is anonymous`)
            .setFooter({ text: 'Moderators: Use buttons below to manage the game' })
            .setTimestamp();

        // Create buttons (only for moderators)
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('story_finish')
                    .setLabel('Finish Submissions')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📝'),
                new ButtonBuilder()
                    .setCustomId('story_announce')
                    .setLabel('Announce Winner')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🏆')
            );

        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete().catch(() => {}); // Delete command message
    }
};
