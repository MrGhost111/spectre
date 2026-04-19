const { EmbedBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize the API with your key (make sure this is in your .env file)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

module.exports = {
    name: 'ai',
    description: 'Chat with the Gemini AI.',
    async execute(message, args) {
        // Check if the user actually typed a prompt
        const prompt = args.join(' ');
        if (!prompt) {
            return message.reply("You need to actually say something for me to respond!");
        }

        try {
            // Start a typing indicator so users know the bot is "thinking"
            await message.channel.sendTyping();

            // Generate content
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            // Create the embed response
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setAuthor({ name: 'Gemini AI', iconURL: 'https://www.gstatic.com/lamda/images/favicon_v2_71dfade91574d78e3579d.png' })
                .setDescription(responseText.length > 2048 ? responseText.substring(0, 2045) + '...' : responseText)
                .setFooter({ text: `Requested by ${message.author.tag}` })
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Gemini API Error:', error);

            // Helpful error messages
            if (error.message.includes('429')) {
                message.reply("I'm exhausted! (Rate limit hit). Try again in a minute.");
            } else {
                message.reply("My brain just short-circuited. Check the console for details.");
            }
        }
    },
};