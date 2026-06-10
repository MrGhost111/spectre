// textcommands/imagine.js
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const https = require('https');
const dns = require('dns');

dns.setServers(['8.8.8.8', '1.1.1.1']);

function httpsPost(hostname, path, data, headers) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(data);
        const options = {
            hostname,
            path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                ...headers,
            },
        };
        const req = https.request(options, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

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

            let response;
            try {
                response = await httpsPost(
                    'router.huggingface.co',
                    '/models/stabilityai/stable-diffusion-xl-base-1.0',
                    { inputs: prompt },
                    { 'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}` }
                );
            } catch (err) {
                return statusMsg.edit(`❌ Network error: \`${err.message}\``);
            }

            const contentType = response.headers['content-type'] ?? '';

            if (contentType.includes('application/json')) {
                const json = JSON.parse(response.body.toString());
                if (json.error?.toLowerCase().includes('loading')) {
                    return statusMsg.edit(
                        `⏳ Model is warming up. Estimated wait: **${Math.ceil(json.estimated_time ?? 30)}s**. Try again in a moment.`
                    );
                }
                return statusMsg.edit(`❌ API error: \`${json.error ?? JSON.stringify(json)}\``);
            }

            if (response.status !== 200) {
                return statusMsg.edit(`❌ API error: \`${response.status}\` — \`${response.body.toString().slice(0, 200)}\``);
            }

            await statusMsg.edit('🎨 Sending image...');

            const buffer = response.body;
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