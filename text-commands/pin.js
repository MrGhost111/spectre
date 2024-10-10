const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../data/channels.json');

module.exports = {
    name: 'pin',
    description: 'Pin or unpin a message if you are the owner of the channel',
    async execute(message, args) {
        const channelsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        const currentChannelId = message.channel.id;
        const userChannel = Object.values(channelsData).find(ch => ch.channelId === currentChannelId);

        if (!userChannel) {
            return message.reply('This channel is not registered in the system.');
        }

        if (message.author.id !== userChannel.userId) {
            return message.reply("You don't own this channel. Only the owner can pin or unpin messages.");
        }

        let messageToPinOrUnpin;
        if (args[0]) {
            try {
                messageToPinOrUnpin = await message.channel.messages.fetch(args[0]);
            } catch (error) {
                return message.reply('Could not find the message with the provided ID. Please ensure it is correct.');
            }
        } else if (message.reference) {
            try {
                messageToPinOrUnpin = await message.channel.messages.fetch(message.reference.messageId);
            } catch (error) {
                return message.reply('Could not fetch the referenced message. Please try again.');
            }
        } else {
            return message.reply('Please provide a message ID or reply to a message you want to pin or unpin.');
        }

        if (messageToPinOrUnpin) {
            if (messageToPinOrUnpin.pinned) {
                // If the message is already pinned, unpin it and send a confirmation message
                messageToPinOrUnpin.unpin()
                    .then(() => message.reply('The message has been unpinned successfully!'))
                    .catch(error => {
                        message.reply('Failed to unpin the message. Make sure I have permission to unpin messages in this channel.');
                    });
            } else {
                // If the message is not pinned, pin it
                messageToPinOrUnpin.pin().catch(error => {
                    message.reply('Failed to pin the message. Make sure I have permission to pin messages in this channel.');
                });
            }
        }
    }
};
