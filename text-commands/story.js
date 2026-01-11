const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const dataPath = path.join(__dirname, '../data/storyGame.json');

// Initialize story game data file if it doesn't exist
if (!fs.existsSync(dataPath)) {
    const initialData = {
        active: false,
        words: [],
        submissions: {},
        votes: {},
        guildId: null,
        channelId: null
    };
    fs.writeFileSync(dataPath, JSON.stringify(initialData, null, 2), 'utf8');
}

// Function to generate 5 random words using categories
function generateRandomWords() {
    const wordCategories = {
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

    const categories = Object.keys(wordCategories);
    const selectedWords = [];

    // Ensure at least one word from each major category
    const mustHave = ['nouns', 'verbs', 'adjectives'];

    for (const category of mustHave) {
        const words = wordCategories[category];
        const randomWord = words[Math.floor(Math.random() * words.length)];
        selectedWords.push(randomWord);
    }

    // Fill remaining 2 slots with random words from any category
    while (selectedWords.length < 5) {
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        const words = wordCategories[randomCategory];
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

        // Generate 5 random words
        const words = generateRandomWords();

        // Save game state
        storyData.active = true;
        storyData.words = words;
        storyData.submissions = {};
        storyData.votes = {};
        storyData.guildId = message.guild.id;
        storyData.channelId = message.channel.id;
        fs.writeFileSync(dataPath, JSON.stringify(storyData, null, 2), 'utf8');

        // Create embed
        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('📖 Story Writing Challenge!')
            .setDescription(`Create a story using **ALL** of these 5 words:\n\n${words.map(w => `**${w}**`).join(' • ')}\n\n**How to participate:**\n1. Write a creative story including all 5 words\n2. Send your story to me via **DM** (Direct Message)\n3. Wait for voting to begin!\n\n**Rules:**\n• Use all 5 words in your story\n• Stories can be any length\n• One submission per person\n• Voting is anonymous`)
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
        await message.delete().catch(() => { }); // Delete command message
    }
};