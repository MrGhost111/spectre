const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'snipe',
    description: 'Snipe the last deleted message(s)',
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

        const snipedMessages = message.client.snipedMessages.get(message.channel.id) || [];
        if (snipedMessages.length === 0) {
            return message.reply('There are no deleted messages to snipe.');
        }

        const messagesToDisplay = snipedMessages.slice(-snipeCount);

        const embed = new EmbedBuilder()
            .setColor(0x0099ff);

        let description = '';
        messagesToDisplay.forEach(msg => {
            const timestamp = `<t:${msg.timestamp}:t>`; // Discord timestamp formatting
            description += `**[${timestamp}] ${msg.author}:** ${msg.content}\n`;
        });

        embed.setDescription(description.trim());
        embed.setFooter({ text: `Command used by ${message.author.username}` });

        await message.reply({ embeds: [embed] });
        console.log(`Snipe command executed with ${snipeCount} messages.`);
    },
};
