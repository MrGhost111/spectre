// textcommands/imagine.js
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

module.exports = {
    name: 'imagine',
    description: 'Generate an image using a free AI model.',
    async execute(message, args) {
        const prompt = args.join(' ');
        if (!prompt) {
            return message.reply('You need to describe something for me to generate!');
        }

        const statusMsg = await message.reply('🎨 Generating your image, please wait...');

        try {
            await statusMsg.edit('🎨 Contacting Hugging Face API...');

            const response = await fetch(
                'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
                    },
                    body: JSON.stringify({ inputs: prompt }),
                }
            ).catch(err => { throw new Error(`Network error: ${err.message}`); });

            const contentType = response.headers.get('content-type') ?? '';

            if (contentType.includes('application/json')) {
                const json = await response.json();
                if (json.error?.toLowerCase().includes('loading')) {
                    return statusMsg.edit(
                        `⏳ The AI model is warming up. Estimated wait: **${Math.ceil(json.estimated_time ?? 30)}s**. Try again in a moment.`
                    );
                }
                return statusMsg.edit(`❌ API error: \`${json.error ?? JSON.stringify(json)}\``);
            }

            if (!response.ok) {
                return statusMsg.edit(`❌ API error: \`${response.status} ${response.statusText}\``);
            }

            await statusMsg.edit('🎨 Downloading image...');

            const buffer = Buffer.from(await response.arrayBuffer());
            if (!buffer || buffer.length === 0) {
                return statusMsg.edit('❌ API returned an empty image. Try a different prompt.');
            }

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
            await statusMsg.delete().catch(() => null);

        } catch (error) {
            await statusMsg.edit(`❌ **Error:** \`${error.message ?? String(error)}\``).catch(() => null);
        }
    },
};