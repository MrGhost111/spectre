module.exports = {
//
    name: 'messageDelete',
    execute(client, message) {
        if (message.author.bot) return;

        const snipes = client.snipedMessages.get(message.channel.id) || [];
        snipes.push({
            content: message.content,
            author: message.author.tag,
            timestamp: Math.floor(Date.now() / 1000),
        });
        client.snipedMessages.set(message.channel.id, snipes.slice(-5));
    },
};
