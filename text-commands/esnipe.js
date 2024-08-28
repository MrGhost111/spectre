const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'esnipe',
    description: 'Snipe the last edited message(s)',
    async execute(message, args) {
        // Define the role-based permissions
        const rolePermissions = {
            '1030707878597763103': 1, // Role IDs and their corresponding snipe limits
            '866641249452556309': 1,
            '721331975847411754': 1,
            '768448955804811274': 1,
            '1028256286560763984': 2,
            '768449168297033769': 2,
            '765988972596822036': 3,
            '946729964328337408': 3,
            '866641313754251297': 3
        };

        // Check user's roles
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

        // Fetch edited messages
        const editedMessages = message.client.editedMessages.get(message.channel.id) || [];
        if (editedMessages.length === 0) {
            return message.reply('There are no edited messages to snipe.');
        }

        // Determine messages to display
        const messagesToDisplay = editedMessages.slice(-snipeCount);

        // Create embed
        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('Sniped Edited Messages');

        messagesToDisplay.forEach(msg => {
            const authorName = msg.author ? msg.author.username : 'Unknown User';
            const oldContent = msg.oldContent || 'No content';
            const newContent = msg.newContent || 'No content';
            embed.addFields({ name: authorName, value: `**Old:** ${oldContent}\n**New:** ${newContent}` });
        });

        await message.reply({ embeds: [embed] });
        console.log(`Esnipe command executed with ${snipeCount} messages.`);
    },
};
