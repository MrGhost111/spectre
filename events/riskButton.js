// JavaScript source code
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const mutesPath = path.join(__dirname, '../../data/mutes.json');
const riskPath = path.join(__dirname, '../../data/risk.json');
const MUTED_ROLE_ID = '673978861335085107';

function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
}

module.exports = async function handleRiskButton(interaction) {
    try {
        const userId = interaction.user.id;
        const guild = interaction.guild;
        const currentTime = Math.floor(Date.now() / 1000);

        // Load data
        let riskData = { sessions: {} };
        try { riskData = JSON.parse(fs.readFileSync(riskPath, 'utf8')); } catch (_) { }
        if (!riskData.sessions) riskData.sessions = {};

        let mutesData = { users: [] };
        try { mutesData = JSON.parse(fs.readFileSync(mutesPath, 'utf8')); } catch (_) { }
        if (!mutesData.users) mutesData.users = [];

        // Must have an active mute to press Risk
        const userMute = mutesData.users.find(m => m.userId === userId && m.muteEndTime > currentTime);
        if (!userMute) {
            return interaction.reply({
                content: "You don't have an active mute, so you can't use Risk.",
                ephemeral: true
            });
        }

        // Session key ties both participants together regardless of who is currently muted
        const sessionKey = [userMute.issuerId, userMute.userId].sort().join('_');
        if (!riskData.sessions[sessionKey]) riskData.sessions[sessionKey] = {};
        const session = riskData.sessions[sessionKey];

        // Block if already failed this round
        if (session.lockedOut === userId) {
            return interaction.reply({
                content: "You already failed your Risk attempt. You can't press it again this round.",
                ephemeral: true
            });
        }

        const opponentId = userMute.issuerId === userId ? userMute.targetId : userMute.issuerId;
        const remainingTime = userMute.muteEndTime - currentTime;
        const doubleDuration = remainingTime * 2;
        const success = Math.random() < 0.5;

        if (success) {
            // Remove presser's mute role
            try {
                const presserMember = await guild.members.fetch(userId);
                await presserMember.roles.remove(MUTED_ROLE_ID);
            } catch (e) { console.error('Risk: failed to remove presser mute role:', e); }

            // Clear presser, clear any old opponent mute, add new one
            mutesData.users = mutesData.users.filter(m => m.userId !== userId && m.userId !== opponentId);
            mutesData.users.push({
                userId: opponentId,
                issuerId: userId,
                targetId: opponentId,
                muteStartTime: currentTime,
                muteEndTime: currentTime + doubleDuration,
                guildId: guild.id
            });

            // Apply mute role to opponent and schedule removal
            try {
                const opponentMember = await guild.members.fetch(opponentId);
                await opponentMember.roles.add(MUTED_ROLE_ID);

                setTimeout(async () => {
                    try {
                        const refreshed = await guild.members.fetch(opponentId);
                        const latestMutes = JSON.parse(fs.readFileSync(mutesPath, 'utf8'));
                        const latestMute = (latestMutes.users || []).find(m => m.userId === opponentId);
                        if (!latestMute || latestMute.muteEndTime <= Math.floor(Date.now() / 1000)) {
                            await refreshed.roles.remove(MUTED_ROLE_ID);
                        }
                    } catch (e) { console.error('Risk: error removing opponent role after timeout:', e); }
                }, doubleDuration * 1000);
            } catch (e) { console.error('Risk: failed to apply mute role to opponent:', e); }

            // Reset lock-out so opponent can now press Risk
            session.lockedOut = null;
            fs.writeFileSync(mutesPath, JSON.stringify(mutesData, null, 2));
            fs.writeFileSync(riskPath, JSON.stringify(riskData, null, 2));

            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor('#00FF00')
                    .setDescription(
                        `🎲 **Risk — SUCCESS!**\n\n` +
                        `<@${userId}> won the risk!\n` +
                        `<@${opponentId}> is now muted for **${formatDuration(doubleDuration)}** (double the remaining time).`
                    )]
            });

        } else {
            // Lock out the presser — their mute stays unchanged
            session.lockedOut = userId;
            fs.writeFileSync(riskPath, JSON.stringify(riskData, null, 2));

            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setDescription(
                        `🎲 **Risk — FAILED!**\n\n` +
                        `<@${userId}> lost the risk and is still muted for **${formatDuration(remainingTime)}**.\n` +
                        `You cannot press Risk again this round.`
                    )]
            });
        }

    } catch (error) {
        console.error('Error in handleRiskButton:', error);
        try {
            await interaction.reply({ content: 'An error occurred while processing the risk button.', ephemeral: true });
        } catch (_) { }
    }
};