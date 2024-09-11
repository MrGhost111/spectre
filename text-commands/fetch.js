const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'fetch',
    description: 'Scan channels for donation messages and track user donations.',
    async execute(message, args) {
        const filePath = path.join(__dirname, '..', 'data', 'test.json');
        let usersData = {};

        // Load users data from test.json
        if (fs.existsSync(filePath)) {
            const rawData = fs.readFileSync(filePath, 'utf8');
            usersData = JSON.parse(rawData);
        } else {
            usersData = {};
        }

        let donationMessagesCount = 0;
        let channelsWithDonations = 0;
        let uniqueUsersWithDonations = new Set();

        const logDonations = (channelName, messagesCount) => {
            if (messagesCount > 0) {
                message.channel.send(`Scanned channel: ${channelName} - Found ${messagesCount} donation message(s).`);
            }
        };

        // Iterate over all text-based channels in the server
        const channels = message.guild.channels.cache.filter(channel => channel.isTextBased());

        for (const channel of channels.values()) {
            try {
                const messages = await channel.messages.fetch({ limit: 100 });

                let channelDonationMessagesCount = 0;

                messages.forEach(msg => {
                    if (msg.embeds.length > 0 && msg.author.id === '783306479721512960') {
                        const embed = msg.embeds[0];
                        const description = embed.description || '';

                        // Ignore messages that contain 'giveaway manager'
                        if (!description.includes('giveaway manager') && description.includes('Total Donations')) {
                            const amountMatch = description.match(/Total Donations\s*:\s*([\d,]+)/);
                            const userMatch = description.match(/Donation\s*➤\s*(.*)'s Donation/);

                            if (amountMatch && userMatch) {
                                const totalDonation = parseInt(amountMatch[1].replace(/,/g, ''), 10);
                                const username = userMatch[1].trim();

                                // Update users data if a higher donation is detected
                                if (!usersData[username] || usersData[username] < totalDonation) {
                                    usersData[username] = totalDonation;
                                }

                                uniqueUsersWithDonations.add(username);
                                channelDonationMessagesCount++;
                            }
                        }
                    }
                });

                if (channelDonationMessagesCount > 0) {
                    channelsWithDonations++;
                    donationMessagesCount += channelDonationMessagesCount;
                    logDonations(channel.name, channelDonationMessagesCount);
                }
            } catch (error) {
                console.error(`Failed to fetch messages from ${channel.name}:`, error);
            }
        }

        // Save users data to test.json
        fs.writeFileSync(filePath, JSON.stringify(usersData, null, 2));

        // Send final summary to the channel
        message.channel.send(`--- Scan Complete ---
Total channels with donations: ${channelsWithDonations}
Total donation messages: ${donationMessagesCount}
Total unique users with donation notes: ${uniqueUsersWithDonations.size}`);
    },
};
