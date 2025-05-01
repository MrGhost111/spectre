const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'track',
    description: 'Fetch components from a message to analyze its structure',
    async execute(client, message, args) {
        if (!args[0]) {
            return message.reply('⚠️ Please provide a valid message ID.');
        }

        const messageId = args[0];
        const channel = message.channel;
        const targetMessage = await channel.messages.fetch(messageId).catch(() => null);

        if (!targetMessage) {
            return message.reply('❌ Message not found!');
        }

        // Extract components and format for display
        const componentsData = targetMessage.components.map(comp => JSON.stringify(comp, null, 2));
        const embed = new EmbedBuilder()
            .setTitle('🔍 Message Component Data')
            .setDescription(`\`\`\`json\n${componentsData.join('\n')}\`\`\``)
            .setColor('#0084ff')
            .setFooter({ text: `Message ID: ${messageId}` });

        await message.reply({ embeds: [embed] });
    }
};