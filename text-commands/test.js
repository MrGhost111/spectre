const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'test',
  description: 'Checks your account age and displays relevant information.',
  async execute(interaction, client) {
    const now = Date.now();
    const TWO_DAYS = 1000 * 60 * 60 * 24 * 2;
    const FIFTEEN_DAYS = 1000 * 60 * 60 * 24 * 15;

    const member = interaction.member;
    const user = member.user;

    const accountAge = now - user.createdAt.getTime();

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`${user.username}'s Account Information`)
      .setFooter({ text: 'By Bard, your friendly AI assistant' });

    if (accountAge < TWO_DAYS) {
      embed.setDescription(`Hey there ${user.username}, your account is less than 2 days old. Welcome to the server!`);
    } else if (accountAge < FIFTEEN_DAYS) {
      embed.setDescription(`Hi ${user.username}, your account is less than 15 days old. We hope you're enjoying the server!`);
    } else {
      embed.setDescription(`Welcome back, ${user.username}!`);
    }

    await interaction.channel.send({ embeds: [embed] });
  },
};
