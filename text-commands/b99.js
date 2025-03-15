const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'b99',
    description: 'Displays a random Brooklyn Nine-Nine episode.',
    async execute(message, args) {
        try {
            // Brooklyn Nine-Nine seasons and episodes data
            const b99Data = {
                1: 22,  // Season 1: 22 episodes
                2: 23,  // Season 2: 23 episodes
                3: 23,  // Season 3: 23 episodes
                4: 22,  // Season 4: 22 episodes
                5: 22,  // Season 5: 22 episodes
                6: 18,  // Season 6: 18 episodes
                7: 13,  // Season 7: 13 episodes
                8: 10   // Season 8: 10 episodes
            };

            // Select a random season
            const seasons = Object.keys(b99Data);
            const randomSeason = seasons[Math.floor(Math.random() * seasons.length)];

            // Select a random episode from that season
            const episodeCount = b99Data[randomSeason];
            const randomEpisode = Math.floor(Math.random() * episodeCount) + 1;

            // Construct the image URL
            const imageUrl = `https://brooklyn99.homeofthenutty.com/albums/Season_${randomSeason}/b99_s${randomSeason}_e${randomEpisode.toString().padStart(2, '0')}.jpg`;

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`Brooklyn Nine-Nine S${randomSeason}E${randomEpisode.toString().padStart(2, '0')}`)
                .setDescription(`You should watch Season ${randomSeason}, Episode ${randomEpisode}!`)
                .setImage(imageUrl)
                .setFooter({ text: 'NINE-NINE!' })
                .setTimestamp();

            // Send the embed
            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error in b99 command:', error);
            message.reply('There was an error processing your request. Please try again later.');
        }
    },
};
