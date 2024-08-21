module.exports = {
  name: 'esnipe',
  execute(message) {
    const editedMessages = message.channel.messages.cache.filter(m => m.editedTimestamp);
    const latestEdited = editedMessages.sort((a, b) => b.editedTimestamp - a.editedTimestamp).first();
    if (!latestEdited) return message.channel.send('No edited messages found.');
    message.channel.send({ embeds: [{ title: 'Edited Message', description: `**Before:** ${latestEdited.content}, \n**After:** ${latestEdited.content}`, timestamp: latestEdited.editedTimestamp }] });
  }
};
