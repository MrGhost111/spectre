const { client } = require('../index.js');

let lastDeletedMessage = null;

client.on('messageDelete', message => {
    console.log('Message deleted:', message.content);
    lastDeletedMessage = message;
});

client.on('messageCreate', message => {
    if (message.content === ',snipe') {
        console.log('Snipe command received');
        if (lastDeletedMessage) {
            message.channel.send(`Last deleted message: ${lastDeletedMessage.content}`);
        } else {
            message.channel.send('No messages have been deleted recently.');
        }
    }
});

