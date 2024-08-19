const { client } = require('./index.js');

let lastDeletedMessage = null;

client.on('messageDelete', message => {
    lastDeletedMessage = message;
});

client.on('messageCreate', message => {
    if (message.content === ',snipe') {
        if (lastDeletedMessage) {
            message.channel.send(`Last deleted message: ${lastDeletedMessage.content}`);
        } else {
            message.channel.send('No messages have been deleted recently.');
        }
    }
});
