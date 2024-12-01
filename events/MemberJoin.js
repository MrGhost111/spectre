const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const logChannelId = '969496347742982154';
const joinLogsPath = path.join(__dirname, '../data/joinlogs.json');

const loadJoinLogs = () => {
    if (fs.existsSync(joinLogsPath)) {
        return JSON.parse(fs.readFileSync(joinLogsPath, 'utf8'));
    }
    return {};
};

const saveJoinLogs = (logs) => {
    fs.writeFileSync(joinLogsPath, JSON.stringify(logs, null, 2), 'utf8');
};

const cleanJoinLogs = (logs) => {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const memberId in logs) {
        if (logs[memberId].joinTime < oneWeekAgo) {
            delete logs[memberId];
        }
    }
    return logs;
};

const createEmbed = (action, dmStatus, member, color) => {
    return new EmbedBuilder()
        .setTitle(`Member ${action}`)
        .setColor(color)
        .addFields(
            { name: 'Action', value: action, inline: true },
            { name: 'DM Status', value: dmStatus ? '✅' : '❌', inline: true },
            { name: 'User', value: `${member.user.tag} (${member.id})`, inline: false }
        )
        .setFooter({ text: '/assert_dominance' })
        .setTimestamp();
};

module.exports = {
    name: 'guildMemberAdd',
    async execute(client, member) {
        const joinLogs = loadJoinLogs();

        // Clean old entries
        const cleanedLogs = cleanJoinLogs(joinLogs);
        saveJoinLogs(cleanedLogs);

        const accountAge = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24); // Account age in days
        const appealLink = 'https://discord.gg/38YUq6M8wj';
        const reason = 'Reason: Account too young';

        let action, color, dmMessage;
        let dmStatus = true;

        if (accountAge < 2) {
            action = 'Banned';
            color = '#FF0000';
            dmMessage = `${reason}\nAppeal here: ${appealLink}`;
            try {
                await member.send(dmMessage);
            } catch (error) {
                dmStatus = false;
            }
            await member.ban({ reason: 'Account too young' });
        } else if (accountAge < 30) {
            action = 'Kicked';
            color = '#FFFF00';
            dmMessage = `${reason}\nAppeal here: ${appealLink}`;
            try {
                await member.send(dmMessage);
            } catch (error) {
                dmStatus = false;
            }
            await member.kick('Account too young');
        } else {
            action = 'Allowed to Join';
            color = '#00FF00';
            dmStatus = false;
            // Log successful join
            joinLogs[member.id] = {
                joinTime: Date.now()
            };
            saveJoinLogs(joinLogs);
        }

        const logChannel = await client.channels.fetch(logChannelId);
        const embed = createEmbed(action, dmStatus, member, color);
        await logChannel.send({ embeds: [embed] });
    }
};
