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
        channelId: null,
        theme: null
    };
    fs.writeFileSync(dataPath, JSON.stringify(initialData, null, 2), 'utf8');
}

// Themed word categories
const themedWordSets = {
    halloween: {
        nouns: [
            'witch', 'ghost', 'pumpkin', 'skeleton', 'vampire', 'werewolf', 'zombie', 'cauldron',
            'spell', 'curse', 'haunted', 'cemetery', 'tombstone', 'bat', 'spider', 'potion',
            'broomstick', 'monster', 'demon', 'shadow', 'darkness', 'midnight', 'graveyard', 'crypt'
        ],
        verbs: [
            'haunt', 'scare', 'curse', 'transform', 'vanish', 'creep', 'lurk', 'howl',
            'shriek', 'summon', 'bewitch', 'possess', 'frighten', 'terrorize', 'enchant'
        ],
        adjectives: [
            'spooky', 'eerie', 'creepy', 'terrifying', 'haunted', 'mysterious', 'dark', 'sinister',
            'wicked', 'ghostly', 'supernatural', 'chilling', 'macabre', 'ghoulish', 'cursed'
        ],
        concepts: [
            'fear', 'terror', 'nightmare', 'darkness', 'evil', 'magic', 'witchcraft', 'supernatural',
            'death', 'spirits', 'otherworld', 'mystery', 'horror', 'madness'
        ]
    },
    christmas: {
        nouns: [
            'santa', 'reindeer', 'snowman', 'gift', 'tree', 'star', 'angel', 'sleigh',
            'elf', 'chimney', 'stocking', 'bells', 'wreath', 'candy', 'fireplace', 'snow'
        ],
        verbs: [
            'celebrate', 'decorate', 'unwrap', 'sing', 'jingle', 'sparkle', 'give', 'share',
            'gather', 'rejoice', 'deliver', 'brighten', 'warm'
        ],
        adjectives: [
            'jolly', 'merry', 'festive', 'cheerful', 'magical', 'bright', 'cozy', 'warm',
            'sparkling', 'joyful', 'snowy', 'frozen', 'twinkling'
        ],
        concepts: [
            'joy', 'wonder', 'magic', 'warmth', 'family', 'tradition', 'miracle', 'peace',
            'happiness', 'spirit', 'generosity', 'love'
        ]
    },
    fantasy: {
        nouns: [
            'dragon', 'wizard', 'sword', 'castle', 'kingdom', 'quest', 'treasure', 'crystal',
            'phoenix', 'unicorn', 'portal', 'realm', 'sorcerer', 'knight', 'prophecy', 'rune'
        ],
        verbs: [
            'enchant', 'conjure', 'transform', 'quest', 'conquer', 'vanquish', 'discover', 'summon',
            'teleport', 'forge', 'prophecy', 'battle', 'explore'
        ],
        adjectives: [
            'magical', 'ancient', 'mystical', 'legendary', 'powerful', 'enchanted', 'ethereal', 'divine',
            'arcane', 'mythical', 'celestial', 'sacred', 'forgotten'
        ],
        concepts: [
            'magic', 'destiny', 'power', 'wisdom', 'courage', 'adventure', 'legend', 'prophecy',
            'fate', 'honor', 'glory', 'mystery'
        ]
    },
    scifi: {
        nouns: [
            'spaceship', 'alien', 'robot', 'galaxy', 'planet', 'laser', 'cyborg', 'android',
            'station', 'portal', 'colony', 'quantum', 'nebula', 'asteroid', 'satellite'
        ],
        verbs: [
            'teleport', 'explore', 'discover', 'colonize', 'transmit', 'scan', 'decode', 'launch',
            'orbit', 'navigate', 'transmute', 'terraform', 'warp'
        ],
        adjectives: [
            'futuristic', 'advanced', 'alien', 'cosmic', 'interstellar', 'robotic', 'technological', 'synthetic',
            'quantum', 'dimensional', 'digital', 'cybernetic'
        ],
        concepts: [
            'technology', 'future', 'science', 'space', 'time', 'intelligence', 'evolution', 'discovery',
            'innovation', 'exploration', 'progress'
        ]
    },
    romance: {
        nouns: [
            'heart', 'rose', 'kiss', 'sunset', 'moonlight', 'letter', 'promise', 'ring',
            'embrace', 'smile', 'memory', 'moment', 'touch', 'gaze'
        ],
        verbs: [
            'love', 'cherish', 'adore', 'embrace', 'whisper', 'dance', 'yearn', 'confess',
            'promise', 'remember', 'treasure', 'fall', 'bloom'
        ],
        adjectives: [
            'romantic', 'tender', 'passionate', 'gentle', 'sweet', 'devoted', 'eternal', 'beloved',
            'precious', 'intimate', 'heartfelt', 'enchanting'
        ],
        concepts: [
            'love', 'passion', 'devotion', 'destiny', 'soulmate', 'forever', 'happiness', 'longing',
            'desire', 'affection', 'connection', 'intimacy'
        ]
    },
    mystery: {
        nouns: [
            'detective', 'clue', 'mystery', 'secret', 'shadow', 'key', 'puzzle', 'witness',
            'evidence', 'riddle', 'cipher', 'conspiracy', 'suspect', 'alibi'
        ],
        verbs: [
            'investigate', 'discover', 'uncover', 'solve', 'suspect', 'deduce', 'reveal', 'expose',
            'search', 'question', 'examine', 'observe', 'deduce'
        ],
        adjectives: [
            'mysterious', 'suspicious', 'hidden', 'cryptic', 'puzzling', 'enigmatic', 'secretive', 'obscure',
            'elusive', 'shadowy', 'strange', 'peculiar'
        ],
        concepts: [
            'mystery', 'truth', 'deception', 'intrigue', 'conspiracy', 'revelation', 'secret', 'puzzle',
            'enigma', 'suspicion', 'doubt'
        ]
    }
};

// Default/general word categories
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
 * Generate 5 random words based on theme
 * @param {string|null} theme - Optional theme (halloween, christmas, fantasy, scifi, romance, mystery)
 * @returns {string[]} Array of 5 words
 */
function generateRandomWords(theme = null) {
    // Select word set based on theme
    const wordCategories = theme && themedWordSets[theme.toLowerCase()]
        ? themedWordSets[theme.toLowerCase()]
        : defaultWordSets;

    const categories = Object.keys(wordCategories);
    const selectedWords = [];

    // Ensure at least one word from each major category
    const mustHave = ['nouns', 'verbs', 'adjectives'];

    for (const category of mustHave) {
        if (wordCategories[category]) {
            const words = wordCategories[category];
            const randomWord = words[Math.floor(Math.random() * words.length)];
            selectedWords.push(randomWord);
        }
    }

    // Fill remaining slots with random words from any category
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

        // Get theme from args (if provided)
        const theme = args[0] ? args[0].toLowerCase() : null;
        const availableThemes = Object.keys(themedWordSets);

        // Validate theme
        if (theme && !availableThemes.includes(theme)) {
            return message.reply(`❌ Invalid theme! Available themes: ${availableThemes.join(', ')}\n\nOr use \`,story\` without theme for random words.`);
        }

        // Generate 5 random words with theme
        const words = generateRandomWords(theme);

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
            .setTitle(`📖 Story Writing Challenge!${theme ? ` (${theme.toUpperCase()} Theme)` : ''}`)
            .setDescription(`Create a story using **ALL** of these 5 words:\n\n${words.map(w => `**${w}**`).join(' • ')}\n\n**How to participate:**\n1. Write a creative story including all 5 words\n2. Send your story to me via **DM** (Direct Message)\n3. You can edit your submission by editing your DM or sending a new message\n4. Latest submission will be considered\n5. Wait for voting to begin!\n\n**Rules:**\n• Use all 5 words in your story\n• Stories must be at least 50 characters\n• One submission per person (can be updated)\n• Voting is anonymous`)
            .setFooter({ text: 'Moderators: Use buttons below to manage the game' })
            .setTimestamp();

        if (theme) {
            embed.addFields({
                name: '🎨 Theme',
                value: `${theme.charAt(0).toUpperCase() + theme.slice(1)}`,
                inline: true
            });
        }

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