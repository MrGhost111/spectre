module.exports = {
    name: 'dmembed',
    description: 'Sends embed data to your DMs',
    async execute(message) {
        if (message.author.id !== '753491023208120321') return;

        if (!message.reference) {
            return message.reply('Please reply to a message with this command.').catch(console.error);
        }

        try {
            const target = await message.channel.messages.fetch(message.reference.messageId);
            const embedData = target.embeds.length
                ? JSON.stringify(target.embeds, null, 2)
                : 'No embeds found';

            await message.author.send(`\`\`\`json\n${embedData}\n\`\`\``);
            message.react('📬').catch(console.error);
        } catch (error) {
            console.error('DM embed error:', error);
            message.reply('Failed to send embed data.').catch(console.error);
        }
    }
};