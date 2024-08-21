const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'esnipe',
  description: 'Snipe edited messages',
  execute(message, args, editedMessages) {
    const role1 = '1241835441624453221'; // Replace with the actual role ID for single snipe
    const role2 = '828613465932955679'; // Replace with the actual role ID for multiple snipes

    let numMessages = 1;
    if (args[0] && !isNaN(args[0])) {
      numMessages = parseInt(args[0]);
    }

    if (message.member.roles.cache.has(role2)) {
      // User has role2, allow multiple snipes
      numMessages = Math.min(numMessages, editedMessages.size);
    } else if (message.member.roles.cache.has(role1)) {
      // User has role1, allow only one snipe
      numMessages = 1;
    } else {
      return message.reply('You do not have permission to use this command.');
    }

    const messagesToSnipe = Array.from(editedMessages.values())
      .filter(msg => msg.channel.id === message.channel.id)
      .slice(-numMessages)
      .reverse(); // Reverse to show latest message first

    if (messagesToSnipe.length === 0) {
      return message.reply('No messages to snipe.');
    }

    const embed = new EmbedBuilder()
      .setTitle('Sniped Edited Messages')
      .setColor('#FF0000');

    messagesToSnipe.forEach(msg => {
      embed.addFields({ name: msg.author.username, value: msg.content });
    });

    message.channel.send({ embeds: [embed] });
  },
};
