// JavaScript source code
// JavaScript source code
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fetch = require('node-fetch');

module.exports = {
    name: 'generate',
    description: 'Generate an image using a free AI model.',
    async execute(message, args) {
        // 1. Check if the user typed a prompt
        const prompt = args.join(' ');
        if (!prompt) {
            return message.reply("You need to actually describe something for me to generate!");
        }

        try {
            await message.channel.sendTyping();

            // 2. Send request to the free Puter API
            const response = await fetch("https://api.puter.com/v2/ai/txt2img", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt })
            });

            const data = await response.json();

            if (!data.image_base64) {
                console.error("API returned no image:", data);
                return message.reply("I couldn't generate an image for that. Try a different prompt.");
            }

            // 3. Convert base64 → buffer → attachment
            const buffer = Buffer.from(data.image_base64, "base64");
            const attachment = new AttachmentBuilder(buffer, { name: "image.png" });

            // 4. Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setAuthor({
                    name: 'AI Image Generator',
                    iconURL: 'https://cdn-icons-png.flaticon.com/512/4712/4712100.png'
                })
                .setDescription(`**Prompt:** ${prompt}`)
                .setImage('attachment://image.png')
                .setFooter({ text: `Requested by ${message.author.tag}` })
                .setTimestamp();

            // 5. Send embed + image
            await message.channel.send({ embeds: [embed], files: [attachment] });

        } catch (error) {
            console.error('Image API Error:', error);

            if (error.message && error.message.includes('429')) {
                return message.reply("I'm generating too fast. Slow down a bit.");
            } else {
                return message.reply("Something went wrong while generating the image. Check console.");
            }
        }
    },
};
