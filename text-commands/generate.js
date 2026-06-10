// textcommands/imagine.js
module.exports = {
    name: 'imagine',
    description: 'Generate an image using a free AI model.',
    async execute(message, args) {
        const prompt = args.join(' ');
        if (!prompt) {
            return message.reply('Please provide a prompt!');
        }
        return message.reply(`✅ Command works! Prompt received: **${prompt}**`);
    },
};