const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fetch = require('node-fetch');

module.exports = {
    name: 'imagine',
    description: 'Generate an image using a free AI model.',
    async execute(message, args) {
        const prompt = args.join(' ');
        if (!prompt) {
            return message.reply("You need to actually describe something for me to generate!");
        }

        try {
            await message.channel.sendTyping();

            const encoded = encodeURIComponent(prompt);
            // seed makes each generation unique; width/height optional
            const url = `https://image.pollinations.ai/prompt/${encoded}?seed=${Date.now()}&width=768&height=768&nologo=true`;

            const response = await fetch(url);
            if (!response.ok) {
                return message.reply("Couldn't generate an image for that. Try a different prompt.");
            }

            const buffer = Buffer.from(await response.arrayBuffer());
            const attachment = new AttachmentBuilder(buffer, { name: 'image.png' });

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

            await message.channel.send({ embeds: [embed], files: [attachment] });

        } catch (error) {
            console.error('Image generation error:', error);
            return message.reply("Something went wrong while generating the image.");
        }
    },
};