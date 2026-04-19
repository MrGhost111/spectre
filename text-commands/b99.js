const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'b99',
    description: 'Displays a random Brooklyn Nine-Nine episode with full details.',
    async execute(message, args) {
        const TVMAZE_SHOW_ID = '49';

        try {
            const response = await fetch(`https://api.tvmaze.com/shows/${TVMAZE_SHOW_ID}/episodes`);
            if (!response.ok) throw new Error('API Error');

            const episodes = await response.json();
            const randomEpisode = episodes[Math.floor(Math.random() * episodes.length)];

            // Clean up the summary (removes <p> and <b> tags)
            const cleanSummary = randomEpisode.summary
                ? randomEpisode.summary.replace(/<[^>]*>/g, '')
                : "No description available for this episode.";

            const embed = new EmbedBuilder()
                .setColor('#F9D71C') // B99 Yellow
                .setTitle(`Brooklyn Nine-Nine: ${randomEpisode.name}`)
                .setURL(randomEpisode.url) // Clicking title opens the TVMaze page
                .setThumbnail('https://static.tvmaze.com/uploads/images/medium_portrait/165/414612.jpg') // Small show poster
                .addFields(
                    { name: 'Season', value: `${randomEpisode.season}`, inline: true },
                    { name: 'Episode', value: `${randomEpisode.number}`, inline: true },
                    { name: 'Aired', value: randomEpisode.airdate || 'Unknown', inline: true }
                )
                .setDescription(cleanSummary.length > 250 ? cleanSummary.substring(0, 247) + '...' : cleanSummary)
                .setFooter({ text: 'NINE-NINE! | Data via TVMaze' })
                .setTimestamp();

            if (randomEpisode.image) {
                embed.setImage(randomEpisode.image.original);
            }

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            message.reply('"Everything is garbage!" - Captain Holt (The API failed).');
        }
    },
};