const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { getUserInfo, handleError, assertUserMatches } = require('../utility/commonFunctions');
const { systemLogQueries } = require('../utility/database');

/**
 * Generates an error report from system logs and sends it to the owner via DM.
 * CustomId: support_report_{userId}
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleGenerateReport(interaction) {
    const { adminData, lang } = getUserInfo(interaction.user.id);
    try {
        const expectedUserId = interaction.customId.split('_')[2];
        if (!(await assertUserMatches(interaction, expectedUserId, lang))) return;

        // Owner-only access
        if (!adminData?.is_owner) {
            return await interaction.reply({ content: lang.common.noPermission, ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const rl = lang.support.report;

        // Fetch recent error logs
        const errorLogs = systemLogQueries.getLogsByActionType('error');
        const recentErrors = errorLogs.slice(0, 50); // Limit to 50 most recent

        if (recentErrors.length === 0) {
            return await interaction.editReply({ content: rl.noErrors });
        }

        // Build report content
        const reportLines = [`Error Report — ${new Date().toISOString()}`, `Total errors in DB: ${errorLogs.length}`, `Showing latest ${recentErrors.length}`, ''];

        for (const log of recentErrors) {
            reportLines.push(`[${log.time}] ${log.action}`);
            if (log.extra_details) {
                try {
                    const details = JSON.parse(log.extra_details);
                    if (details.stack_trace) {
                        reportLines.push(details.stack_trace);
                    }
                } catch {
                    reportLines.push(log.extra_details.substring(0, 500));
                }
            }
            reportLines.push('---');
        }

        const reportContent = reportLines.join('\n');
        const attachment = new AttachmentBuilder(Buffer.from(reportContent, 'utf-8'), { name: 'error_report.txt' });

        // Discord server link button
        const discordBtn = new ButtonBuilder()
            .setLabel(rl.discordButton)
            .setStyle(ButtonStyle.Link)
            .setURL('https://discord.gg/sgFkrZvmf7');

        const row = new ActionRowBuilder().addComponents(discordBtn);
        const dmContent = rl.dmMessage.replace('{time}', Math.floor(Date.now() / 1000));

        try {
            await interaction.user.send({ content: dmContent, files: [attachment], components: [row] });
            await interaction.editReply({ content: rl.dmSent });
        } catch {
            await interaction.editReply({ content: rl.dmFailed });
        }
    } catch (error) {
        await handleError(interaction, lang, error, 'handleGenerateReport');
    }
}

module.exports = {
    handleGenerateReport
};
