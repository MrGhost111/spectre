// textcommands/imagine.js
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

        // Send a status message we can edit as we go — this also confirms the command ran at all
        const statusMsg = await message.reply('🎨 Generating your image, please wait...');

        try {
            const encoded = encodeURIComponent(prompt);
            const url = `https://image.pollinations.ai/prompt/${encoded}?seed=${Date.now()}&width=768&height=768&nologo=true`;

            await statusMsg.edit('🎨 Sending request to image API...');

            let response;
            try {
                response = await fetch(url);
            } catch (fetchError) {
                return statusMsg.edit(
                    `❌ **Network error — could not reach the image API.**\n\`\`\`${fetchError.message}\`\`\``
                );
            }

            if (!response.ok) {
                return statusMsg.edit(
                    `❌ **API returned an error.**\nStatus: \`${response.status} ${response.statusText}\`\n` +
                    `This usually means the service is down or your prompt was rejected.`
                );
            }

            await statusMsg.edit('🎨 Downloading image...');

            let buffer;
            try {
                buffer = Buffer.from(await response.arrayBuffer());
            } catch (bufferError) {
                return statusMsg.edit(
                    `❌ **Failed to read image data from the API response.**\n\`\`\`${bufferError.message}\`\`\``
                );
            }

            if (!buffer || buffer.length === 0) {
                return statusMsg.edit(
                    `❌ **The API returned an empty image.** Try a different prompt or wait a moment and retry.`
                );
            }

            await statusMsg.edit('🎨 Sending image...');

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

            // Delete the status message now that the real result is sent
            await statusMsg.delete().catch(() => null);

        } catch (error) {
            // Catch-all for anything unexpected — show full error on Discord
            await statusMsg.edit(
                `❌ **Unexpected error while generating image.**\n\`\`\`${error.message ?? String(error)}\`\`\``
            ).catch(() => null);
        }
    },
};