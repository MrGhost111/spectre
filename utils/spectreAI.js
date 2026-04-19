const { EmbedBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = {
    name: 'ai',
    description: 'Chat with the Gemini AI.',
    async execute(message, args) {
        // 1. Check if the user typed a prompt
        const prompt = args.join(' ');
        if (!prompt) {
            return message.reply("You need to actually say something for me to respond!");
        }

        // 2. Safely check for the API key INSIDE the execute block
        if (!process.env.GEMINI_KEY) {
            console.error('CRITICAL: Missing GEMINI_KEY in environment variables!');
            return message.reply("My API key is missing. Please check the bot's `.env` file.");
        }

        try {
            await message.channel.sendTyping();

            // 3. Initialize the AI client here, guaranteeing the .env file is loaded
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            // Generate content
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            // Create the embed response
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setAuthor({
                    name: 'Gemini AI',
                    iconURL: 'https://www.gstatic.com/lamda/images/favicon_v2_71dfade91574d78e3579d.png'
                })
                // Discord embed descriptions have a max limit of 4096 characters, but 2048 is safe.
                .setDescription(responseText.length > 2048 ? responseText.substring(0, 2045) + '...' : responseText)
                .setFooter({ text: `Requested by ${message.author.tag}` })
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Gemini API Error:', error);

            // Added return statements so the execution stops gracefully
            if (error.message && error.message.includes('429')) {
                return message.reply("I'm exhausted! (Rate limit hit). Try again in a minute.");
            } else if (error.message && error.message.includes('API key not valid')) {
                return message.reply("My API key is invalid. Please check the `.env` file.");
            } else {
                return message.reply("My brain just short-circuited. Check the console for details.");
            }
        }
    },
};