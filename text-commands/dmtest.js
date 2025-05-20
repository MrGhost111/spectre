// dm-test.js - Place this in your text-commands folder
module.exports = {
    name: 'dmtest',
    description: 'Tests the bot\'s ability to send DMs',
    aliases: ['testdm'],
    async execute(message, args) {
        try {
            // Log that the command was triggered
            console.log(`DM test command used by ${message.author.tag}`);
            
            // First send a message to the channel where the command was used
            await message.channel.send(`<@${message.author.id}>, I'm sending you a DM now. Please check your DMs.`);
            
            // Then try to send a DM to the user
            await message.author.send('This is a test DM from the bot. If you can see this, DMs are working correctly!');
            
            // Log success
            console.log(`Successfully sent test DM to ${message.author.tag}`);
        } catch (error) {
            console.error(`Error sending test DM: ${error}`);
            await message.channel.send(`Failed to send you a DM. Please check if you have DMs enabled for this server.`);
        }
    },
};
