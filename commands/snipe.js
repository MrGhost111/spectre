module.exports = {
  name: 'snipe',
  execute(message) {
    const deletedMessages = message.channel.messages.cache.filter(m => m.deleted);
    const latestDeleted = deletedMessages.sort((a, b) => b.createdTimestamp - a.createdTimestamp).first();
    if (!latestDeleted) return message.channel.send('No deleted messages found.');
    message.channel.send({ embeds: [{ title: 'Sniped Message', description: latestDeleted.content, timestamp: latestDeleted.createdAt }] });
  }
};
