const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'esnipe',
    description: 'Snipe the last edited message(s)',
    async execute(message, args) {
       const rolePermissions = {
            '768448459484692490': 1,
            '1030707878597763103': 1,
            '866641177943080960': 1,
            '768448955804811274': 2,
            '721331975847411754': 2,
            '1028256286560763984': 2,
            '866641299355861022': 2,
            '1028256279124250624': 3,
            '765988972596822036': 3,
            '946729964328337408': 3,
            '866641313754251297': 3,
            '713452411720827013': 5,
        };

        const userRoles = message.member.roles.cache.map(role => role.id);
        const highestRole = userRoles.reduce((max, roleId) => Math.max(max, rolePermissions[roleId] || 0), 0);

        if (highestRole === 0) {
            return message.reply('You do not meet the role requirements to use this command.');
        }

        let snipeCount = parseInt(args[0], 10) || 1;
        if (isNaN(snipeCount) || snipeCount < 1) {
            snipeCount = 1;
        } else if (snipeCount > highestRole) {
            snipeCount = highestRole;
        }

        const editedMessages = message.client.editedMessages.get(message.channel.id) || [];
        if (editedMessages.length === 0) {
            return message.reply('There are no edited messages to snipe.');
        }

        const messagesToDisplay = editedMessages.slice(-snipeCount);

        const embed = new EmbedBuilder().setColor(0x0099ff);
        let description = '';
        messagesToDisplay.forEach(msg => {
            const timestamp = `<t:${msg.timestamp}:t>`; // Discord timestamp formatting
            description += `**[${timestamp}] ${msg.author}:** ${msg.oldContent}\n`; // Add newline character
        });

        embed.setDescription(description.trim());
        embed.setFooter({ text: `Command used by ${message.author.username}` });

        const deleteButton = new ButtonBuilder()
            .setCustomId('delete_esnipe')
            .setEmoji('<:delete:1279632440343789659>')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(deleteButton);

        try {
            const replyMessage = await message.reply({ embeds: [embed], components: [row] });

            // Remove the button after 15 seconds with error handling
            setTimeout(async () => {
                try {
                    await replyMessage.edit({ components: [] });
                } catch (error) {
                    // Ignore error if the message was already deleted or can't be found
                    if (error.code !== 10008) { // 10008: Unknown Message
                        console.error('Error removing button:', error);
                    }
                }
            }, 15000);

            // Logging successful execution
            console.log(`Esnipe command executed with ${snipeCount} messages.`);
        } catch (error) {
            console.error('Error sending esnipe message:', error);
        }
    },
};
