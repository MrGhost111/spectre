// JavaScript source code
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const streaksPath = path.join(__dirname, '../../data/streaks.json');

const BASE_ROLES = {
    '1349716423706148894': 80,
    '866641313754251297': 75,
    '866641299355861022': 75,
    '866641249452556309': 70,
    '866641177943080960': 65,
    '866641062441254932': 60,
    '783032959350734868': 70,
    '1038888209440067604': 75,
    '946729964328337408': 75,
    '768449168297033769': 70,
    '768448955804811274': 65,
    '1038106794200932512': 75,
    '1028256279124250624': 70,
    '1028256286560763984': 65,
    '1030707878597763103': 60,
    '721331975847411754': 65,
};

const BOOSTER_ROLES = {
    '1038888209440067604': 5,
    '721331975847411754': 5,
    '721020858818232343': 5,
    '713452411720827013': 5,
};

module.exports = async function handleInfoButton(interaction) {
    const memberRoles = interaction.member.roles.cache;

    let luck = 0;
    let highestBaseRole = null;
    let boosterLuck = 0;
    const contributingRoles = [];

    // Highest base role luck
    for (const [roleId, luckValue] of Object.entries(BASE_ROLES)) {
        if (memberRoles.has(roleId) && luckValue > luck) {
            luck = luckValue;
            highestBaseRole = `<@&${roleId}> (Base Luck: ${luckValue}%)`;
        }
    }

    // Booster luck
    for (const [roleId, boostValue] of Object.entries(BOOSTER_ROLES)) {
        if (memberRoles.has(roleId)) {
            boosterLuck += boostValue;
            contributingRoles.push(`<@&${roleId}> (Booster Luck: +${boostValue}%)`);
        }
    }

    // Streak bonus
    let streakBonus = 0;
    let userStreak = 0;
    try {
        const streaksData = JSON.parse(fs.readFileSync(streaksPath, 'utf8'));
        const userStreakData = streaksData.users.find(u => u.userId === interaction.user.id);
        if (userStreakData) {
            userStreak = userStreakData.streak;
            streakBonus = Math.floor(userStreak / 10);
            if (streakBonus > 0) {
                contributingRoles.push(`Streak Bonus: +${streakBonus}% (from streak of ${userStreak})`);
            }
        }
    } catch (error) {
        console.error('Error reading streaks data:', error);
    }

    if (!highestBaseRole) contributingRoles.push('No base luck roles assigned.');

    const totalLuck = Math.min(luck + boosterLuck + streakBonus, 100);

    return interaction.reply({
        embeds: [new EmbedBuilder()
            .setTitle('Luck Information')
            .setColor(0x6666FF)
            .setDescription(`----------- Your Luck: **${totalLuck}%** -----------`)
            .addFields(
                { name: 'Highest Base Role', value: highestBaseRole || 'None' },
                { name: 'Contributing Roles', value: contributingRoles.join('\n') || 'None' },
                { name: 'Current Streak', value: `${userStreak} (Bonus: +${streakBonus}%)` },
                {
                    name: '----------- Base Roles -----------',
                    value: Object.entries(BASE_ROLES).map(([id, v]) => `<@&${id}> (Luck: ${v}%)`).join('\n') || 'None'
                },
                {
                    name: '----------- Booster Roles -----------',
                    value: Object.entries(BOOSTER_ROLES).map(([id, v]) => `<@&${id}> (Luck: +${v}%)`).join('\n') || 'None'
                }
            )
            .setFooter({ text: 'Luck is calculated based on your roles and streak.' })],
        ephemeral: true
    });
};