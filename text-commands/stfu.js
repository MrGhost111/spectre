const { MessageEmbed } = require('discord.js');
const { cooldownManager } = require('../utils/cooldownManager');

module.exports = {
    name: 'shush',
    description: 'Mute a targeted user with a chance of failure based on role luck.',
    execute: async (message, args) => {
        const muteRoleID = '673978861335085107';
        const baseRoles = [
            { id: '866641313754251297', luck: 75 }, // 100 doll
            { id: '1038106794200932512', luck: 75 }, // 500 tickets
            { id: '866641299355861022', luck: 75 }, // 50 doll
            { id: '946729964328337408', luck: 75 }, // 5b dono
            { id: '866641249452556309', luck: 70 }, // 25 doll
            { id: '768449168297033769', luck: 70 }, // 2.5b dono
            { id: '1028256279124250624', luck: 70 }, // 300 tickets
            { id: '866641177943080960', luck: 65 }, // 10 doll
            { id: '1028256286560763984', luck: 65 }, // 100 tickets
            { id: '768448955804811274', luck: 65 }, // 1b dono
            { id: '866641062441254932', luck: 60 }, // 5 doll
            { id: '1030707878597763103', luck: 60 }, // 50 tickets
        ];
        const boosterRoles = [
            { id: '721331975847411754', luck: 5 }, // booster role
            { id: '795693315978166292', luck: 5 }, // voter role
            { id: '713452411720827013', luck: 5 }, // ush role
        ];

        // Check cooldown
        const cooldown = 30 * 60 * 1000; // 30 minutes
        const userCooldown = cooldownManager.getCooldown(message.author.id, 'shush');
        if (userCooldown) {
            return message.reply(`You need to wait ${Math.round((userCooldown - Date.now()) / 1000)} seconds before using this command again.`);
        }

        // Identify the highest luck role
        let userLuck = 0;
        for (const role of baseRoles) {
            if (message.member.roles.cache.has(role.id)) {
                userLuck = Math.max(userLuck, role.luck);
            }
        }

        // Apply booster roles
        for (const role of boosterRoles) {
            if (message.member.roles.cache.has(role.id)) {
                userLuck += role.luck;
            }
        }

        if (userLuck === 0) {
            return message.reply("You don't have the required role to use this command.");
        }

        // Determine target
        const target = message.mentions.members.first();
        if (!target) {
            return message.reply('Please mention a valid user to shush.');
        }
        if (target.id === message.author.id) {
            return message.reply("You can't shush yourself.");
        }

        // Check if the target has immunity
        const immunity = cooldownManager.getCooldown(target.id, 'shush_immunity');
        if (immunity) {
            return message.reply(`The target is immune for ${Math.round((immunity - Date.now()) / 1000)} more seconds.`);
        }

        // Roll for success based on luck
        const successRoll = Math.random() * 100;
        const success = successRoll <= userLuck;

        // Roll for power
        const powerRoll = Math.random() * 100;
        const muteDuration = powerRoll >= 95 ? 69 : Math.max(30, Math.round(powerRoll * (39 / 50) + 30)); // 30-69 seconds

        // Prepare power and accuracy bars
        const powerBars = generateBars(powerRoll, 'p');
        const accuracyBars = generateBars(userLuck, 'a');

        // Embed response
        const embed = new MessageEmbed()
            .setColor(success ? 'GREEN' : 'RED')
            .setTitle('Shush Command')
            .setDescription(
                `Power: ${Math.round(powerRoll)}\n${powerBars}\n` +
                `Accuracy: ${Math.round(successRoll)}\n${accuracyBars}\n\n` +
                (success ? `You hit ${target} and muted them for ${muteDuration} seconds.` : `You missed and muted yourself for ${muteDuration} seconds.`) +
                `\n\n:streak: Streak: ${success ? (streak + 1) : 0}\n:idk: Luck: ${userLuck}%`
            );

        await message.reply({ embeds: [embed] });

        // Apply mute
        const muteTarget = success ? target : message.member;
        await muteTarget.roles.add(muteRoleID);

        // Set cooldowns
        cooldownManager.setCooldown(message.author.id, 'shush', cooldown);
        cooldownManager.setCooldown(muteTarget.id, 'shush_immunity', 60 * 1000); // 1-minute immunity

        // Unmute after duration
        setTimeout(async () => {
            await muteTarget.roles.remove(muteRoleID);
        }, muteDuration * 1000);
    },
};

function generateBars(percentage, type) {
    const bars = [];
    const fullBars = Math.floor(percentage / 20);
    const halfBars = percentage % 20 >= 10 ? 1 : 0;
    const emptyBars = 5 - fullBars - halfBars;

    for (let i = 0; i < fullBars; i++) bars.push(`:${type}sf:`);
    if (halfBars) bars.push(`:${type}mh:`);
    for (let i = 0; i < emptyBars; i++) bars.push(`:${type}ee:`);

    return bars.join('');
}
