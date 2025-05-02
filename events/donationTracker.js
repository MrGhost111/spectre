const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'countdownEmbed',
    async execute(client, message) {
        const user = message.author;
        const amount = Math.floor(Math.random() * 10000); // Just a sample number for display

        // Initial embed message
        let countdown = 0;
        const embed = new EmbedBuilder()
            .setTitle('⏳ Countdown Tracker')
            .setDescription(`User: ${user.tag}\nAmount: ⏣ ${amount}\n\n**Tracking Countdown...**`)
            .setColor(0x3498db);

        const sentMessage = await message.channel.send({ embeds: [embed] });

        const interval = setInterval(async () => {
            countdown += 5;

            // Generate a random number for display
            const randomNum = Math.floor(Math.random() * 100);
            const updateEmbed = new EmbedBuilder()
                .setTitle('⏳ Countdown Tracker')
                .setDescription(`User: ${user.tag}\nAmount: ⏣ ${amount}\n\nCurrent Status: **${randomNum}**`)
                .setColor(0x3498db);

            await sentMessage.edit({ embeds: [updateEmbed] });

            if (countdown >= 25) {
                clearInterval(interval);
                const finalEmbed = new EmbedBuilder()
                    .setTitle('✅ Countdown Complete')
                    .setDescription(`User: ${user.tag}\nAmount: ⏣ ${amount}\n\n**Tracking Complete!**`)
                    .setColor(0x2ecc71);

                await sentMessage.edit({ embeds: [finalEmbed] });
            }
        }, 5000); // Update every 5 seconds
    }
};