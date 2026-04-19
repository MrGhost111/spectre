const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'b99',
    description: 'Displays a random Brooklyn Nine-Nine episode using the free TVMaze API.',
    async execute(message, args) {
        // Brooklyn Nine-Nine's ID on TVMaze is 49
        const TVMAZE_SHOW_ID = '49';

        try {
            // 1. Fetch the full episode list for the show
            const response = await fetch(`https://api.tvmaze.com/shows/${TVMAZE_SHOW_ID}/episodes`);

            if (!response.ok) throw new Error('Failed to fetch episodes from TVMaze');

            const episodes = await response.json();

            // 2. Pick a random episode from the entire series list
            const randomEpisode = episodes[Math.floor(Math.random() * episodes.length)];

            // 3. Extract data (TVMaze provides 'original' or 'medium' images)
            const episodeName = randomEpisode.name;
            const season = randomEpisode.season;
            const number = randomEpisode.number;
            const summary = randomEpisode.summary ? randomEpisode.summary.replace(/<[^>]*>/g, '') : "No description available.";
            const imageUrl = randomEpisode.image ? randomEpisode.image.original : null;

            // 4. Create the Embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`Brooklyn Nine-Nine: "${episodeName}"`)
                .setDescription(`**Season ${season}, Episode ${number}**\n\n${summary}`)
                .setFooter({ text: 'NINE-NINE!' })
                .setTimestamp();

            if (imageUrl) {
                embed.setImage(imageUrl);
            }

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error in b99 command:', error);
            message.reply('Title of your sex tape! (Wait, no—there was an error processing your request).');
        }
    },
};