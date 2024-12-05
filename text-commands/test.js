module.exports = {
    name: 'testdm',
    description: 'Test DM functionality',
    execute(client, message) {
        const user = message.author;

        user.send('This is a test DM!').then(() => {
            message.reply('DM sent successfully!');
        }).catch((error) => {
            console.error('Failed to send DM:', error);
            message.reply('Failed to send DM.');
        });
    },
};
