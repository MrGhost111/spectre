module.exports = {
    name: 'snipe',
    description: 'Retrieves the last deleted message.',
    permissions: '1241835441624453221', // Optional: Required role ID
    execute(message, args) {
        const amount = args[0] ? parseInt(args[0]) : 1; // Get the amount to snipe

        const snipes = client.snipes.get(message.channel.id);
        if (!snipes) return message.reply('There is nothing to snipe.');

        const snipe = snipes[snipes.length - 1 + amount];
        if (!snipe) return message.reply('There is nothing to snipe.');

        // Send the sniped message
        message.channel.send(snipe.content);
    },
};
