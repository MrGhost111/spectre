const { EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    name: 'guildMemberAdd',
    async execute(client, member) {
        const LOG_CHANNEL_ID = '969496347742982154';
        const APPEAL_LINK = 'https://discord.gg/38YUq6M8wj';
        const EMOJIS = {
            SUCCESS: '<:GreenTick:864757985917665300>',
            FAILED: '<:xmark:934659388386451516>'
        };
        
        try {
            const logChannel = await member.guild.channels.fetch(LOG_CHANNEL_ID);
            if (!logChannel) {
                console.error('Could not find the logging channel');
                return;
            }

            // Check allow list
            let isAllowed = false;
            try {
                const allowListPath = path.join(__dirname, '..', 'data', 'allow.json');
                const data = await fs.readFile(allowListPath, 'utf8');
                const allowList = JSON.parse(data);
                isAllowed = allowList.hasOwnProperty(member.user.id);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.error('Error checking allow list:', error);
                }
            }

            const accountAge = Date.now() - member.user.createdTimestamp;
            const accountDays = Math.floor(accountAge / (1000 * 60 * 60 * 24));
            
            // Prepare base embed structure
            const embed = new EmbedBuilder()
                .setFooter({ text: member.user.id })
                .addFields(
                    { name: 'Username', value: member.user.tag },
                    { name: 'Creation Time', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` },
                    { name: 'Joined at', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` }
                );

            let dmSuccess = false;
            const allowCommandInfo = { name: 'Note for Mods', value: `To allow this user to join despite account age, use \`,allow ${member.user.id}\`` };
            
            // Handle different age cases
            if (accountDays < 2 && !isAllowed) {
                // Attempt to DM before banning
                try {
                    await member.send({
                        content: `You have been banned from ${member.guild.name} because your account is too new (less than 2 days old).\nYou can join our appeal server here: ${APPEAL_LINK}`
                    });
                    dmSuccess = true;
                } catch (error) {
                    console.error('Failed to send DM to user:', error);
                }

                // Ban the member
                await member.ban({ reason: 'Account too new (< 2 days)' });
                
                // Log the ban
                embed.setColor(0xFF0000)
                    .setTitle('User Banned')
                    .addFields(
                        { name: 'Reason', value: 'Account age less than 2 days' },
                        { name: 'DM Status', value: dmSuccess ? `Sent ${EMOJIS.SUCCESS}` : `Failed ${EMOJIS.FAILED}` },
                        allowCommandInfo
                    );
                
            } else if (accountDays < 20 && !isAllowed) {
                // Attempt to DM before kicking
                try {
                    await member.send({
                        content: `You have been kicked from ${member.guild.name} because your account is less than 20 days old.\nYou can join our appeal server here: ${APPEAL_LINK}`
                    });
                    dmSuccess = true;
                } catch (error) {
                    console.error('Failed to send DM to user:', error);
                }

                // Kick the member
                await member.kick('Account less than 20 days old');
                
                // Log the kick
                embed.setColor(0xFFFF00)
                    .setTitle('User Kicked')
                    .addFields(
                        { name: 'Reason', value: 'Account age less than 20 days' },
                        { name: 'DM Status', value: dmSuccess ? `Sent ${EMOJIS.SUCCESS}` : `Failed ${EMOJIS.FAILED}` },
                        allowCommandInfo
                    );
                
            } else {
                // Log successful join for older accounts or allowed users
                embed.setColor(0x00FF00)
                    .setTitle('User Joined')
                    .addFields(
                        {
                            name: 'Status',
                            value: isAllowed ? 
                                'Allowed user (bypass age restriction)' : 
                                'Account age sufficient (20+ days)'
                        },
                        allowCommandInfo
                    );
            }

            // Send the log embed
            await logChannel.send({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error in guildMemberAdd event:', error);
        }
    }
};
