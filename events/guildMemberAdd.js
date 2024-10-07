const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const path = require('path');
const fs = require('fs');

// File path for storing temporary bans
const banFilePath = path.join(__dirname, '..', 'data', 'tempBans.json');

// Ensure the data folder and ban file exist
if (!fs.existsSync(path.join(__dirname, '..', 'data'))) {
    fs.mkdirSync(path.join(__dirname, '..', 'data'));
}

if (!fs.existsSync(banFilePath)) {
    fs.writeFileSync(banFilePath, JSON.stringify({ bans: [] }, null, 2));
}

module.exports = {
    name: 'guildMemberAdd',
    async execute(client, member) {
        const logChannelId = '969496347742982154'; // Log channel ID
        const serverId = '673970118744735764'; // Target server ID
        const minDays = 2 * 24 * 60 * 60 * 1000; // Minimum account age: 2 days in milliseconds
        const limitDays = 15 * 24 * 60 * 60 * 1000; // Account age limit: 15 days in milliseconds

        // Check if the user joined the target server
        if (member.guild.id !== serverId) return;

        const accountAge = Date.now() - member.user.createdAt.getTime(); // Account age in milliseconds
        const logChannel = await client.channels.fetch(logChannelId);

        let embedColor;
        let embedTitle;
        let actionTaken;
        let userMessage = '';
        const footerText = member.user.id;

        if (accountAge < minDays) {
            // Account is less than 2 days old
            userMessage = `Your account isn't even 2 days old, so you are auto-banned for 30 days. If you think this is a mistake, you can appeal in the server: https://discord.gg/38YUq6M8wj`;
            embedColor = 0xFF0000; // Red color
            embedTitle = '<:altacc:805750413566672916> Joined and got banned 💀';
            actionTaken = 'banned';

            // Send DM to the user
            try {
                await member.send(userMessage);
            } catch (err) {
                console.log(`Could not send DM to ${member.user.tag}:`, err);
            }

            // Ban the user for 30 days (temporary ban handling needs to be managed manually)
            await member.ban({ reason: 'Account isn\'t even 2 days old.' });
            
            // Store the temporary ban info
            const banData = JSON.parse(fs.readFileSync(banFilePath));
            banData.bans.push({ userId: member.user.id, unbanAt: Date.now() + 30 * 24 * 60 * 60 * 1000 }); // 30 days from now
            fs.writeFileSync(banFilePath, JSON.stringify(banData, null, 2));

        } else if (accountAge < limitDays) {
            // Account is between 2 and 15 days old
            const daysOld = Math.floor(accountAge / (24 * 60 * 60 * 1000)); // Convert account age to days
            userMessage = `Your account isn't 1 month old. It's just ${daysOld} days old. Feel free to join the server after it's 15 days old. If you think this is a mistake, you can ping the mods in https://discord.gg/38YUq6M8wj`;
            embedColor = 0xFFFF00; // Yellow color
            embedTitle = '<:altacc:805750413566672916> Joined and got kicked 💀';
            actionTaken = 'kicked';

            // Send DM to the user
            try {
                await member.send(userMessage);
            } catch (err) {
                console.log(`Could not send DM to ${member.user.tag}:`, err);
            }

            // Kick the user
            await member.kick('Account is not 1 month old.');

        } else {
            // Account is older than 15 days, let them join
            embedColor = 0x00FF00; // Green color
            embedTitle = 'User joined';
            actionTaken = 'allowed';
        }

        // Create an embed to log the action
        const embed = new EmbedBuilder()
            .setTitle(embedTitle)
            .setColor(embedColor)
            .setDescription(
                `**Username:** ${member.user.tag}\n` +
                `**Account Created:** <t:${Math.floor(member.user.createdAt.getTime() / 1000)}:R>\n` +
                `**Joined:** <t:${Math.floor(Date.now() / 1000)}:R>`
            )
            .setFooter({ text: footerText });

        // Create a ban button for normal joins and kicks
        const button = new ButtonBuilder()
            .setCustomId(`ban_${member.user.id}`)
            .setLabel('Ban (no confirmation)')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(button);

        // Send the log to the specified channel
        if (actionTaken === 'allowed') {
            await logChannel.send({ embeds: [embed], components: [row] });
        } else {
            await logChannel.send({ embeds: [embed] });
        }
    }
};
