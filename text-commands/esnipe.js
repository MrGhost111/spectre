const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'esnipe',
    description: 'Snipe the last edited message(s)',
    async execute(message, args) {
        const rolePermissions = {
            '1030707878597763103': 1,
            '866641249452556309': 1,
            '721331975847411754': 1,
            '768448955804811274': 1,
            '1028256286560763984': 2,
            '768449168297033769': 2,
            '765988972596822036': 3,
            '946729964328337408': 3,
            '866641313754251297': 3
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

        const embed = new EmbedBuilder()
            .setColor(0x0099ff);

        let description = '';
        messagesToDisplay.forEach(msg => {
            const timestamp = `<t:${msg.timestamp}:t>`; // Discord timestamp formatting
            description += `**[${timestamp}] ${msg.author}:** ${msg.oldContent}`;
        });

        embed.setDescription(description.trim());
        embed.setFooter({ text: `Command used by ${message.author.username}` });

        const deleteButton = new ButtonBuilder()
            .setCustomId('delete_esnipe')
            .setEmoji('<:delete:1279632440343789659>')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(deleteButton);

        const replyMessage = await message.reply({ embeds: [embed], components: [row] });

        // Remove the button after 15 seconds
        setTimeout(async () => {
            await replyMessage.edit({ components: [] });
        }, 15000);

        console.log(`Esnipe command executed with ${snipeCount} messages.`);
    },
};
