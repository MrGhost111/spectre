const handleRiskButton = require('./handlers/riskButton');
const handleChannelButtons = require('./handlers/channelButtons');
const handleActivityButtons = require('./handlers/activityButtons');
const handleModalSubmit = require('./handlers/modalSubmit');
const handleDeleteSnipe = require('./handlers/snipeButtons');
const handleLeaderboardButton = require('./handlers/leaderboardButton');
const handleInfoButton = require('./handlers/infoButton');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'interactionCreate',
    async execute(client, interaction) {
        try {
            // ── Slash commands ────────────────────────────────────────────
            if (interaction.isCommand()) {
                const command = client.commands.get(interaction.commandName);
                if (!command) return;
                await command.execute(interaction);
                return;
            }

            // ── Modal submissions ─────────────────────────────────────────
            if (interaction.isModalSubmit()) {
                if (interaction.customId.startsWith('answer_modal_')) return; // handled by guess.js
                await handleModalSubmit(interaction);
                return;
            }

            // ── Button interactions ───────────────────────────────────────
            if (interaction.isButton()) {
                console.log(`Button Interaction Detected: ${interaction.customId}`);

                // Donation confirm buttons
                if (interaction.isMessageComponent() && interaction.customId.includes('confirm')) {
                    const message = interaction.message;
                    if (!client.trackedDonations?.has(message.id)) return;

                    const donationText = message.components?.[0]?.components?.find(c => c.type === 10)?.content || '';
                    const donationMatch = donationText.match(/Successfully donated \*\*⏣\s*([\d,]+)\*\*/);
                    if (!donationMatch) return;

                    const donationAmount = parseInt(donationMatch[1].replace(/,/g, ''), 10);
                    const donorId = client.trackedDonations.get(message.id).user;
                    if (!donorId) return;

                    const guild = await client.guilds.fetch(client.guilds.cache.first().id);
                    const member = await guild.members.fetch(donorId);

                    usersData[donorId] = usersData[donorId] || {};
                    usersData[donorId].totalDonated = (usersData[donorId].totalDonated || 0) + donationAmount;
                    usersData[donorId].weeklyDonated = (usersData[donorId].weeklyDonated || 0) + donationAmount;
                    usersData[donorId].lastDonation = new Date().toISOString();
                    usersData[donorId].currentTier = member.roles.cache.has(TIER_2_ROLE_ID) ? 2
                        : (member.roles.cache.has(TIER_1_ROLE_ID) ? 1 : 0);

                    statsData.totalDonations += donationAmount;
                    saveStatsData();
                    saveUsersData();

                    const requirement = usersData[donorId].currentTier === 2 ? TIER_2_REQUIREMENT : TIER_1_REQUIREMENT;

                    const donationEmbed = new EmbedBuilder()
                        .setTitle('<:prize:1000016483369369650> New Donation')
                        .setColor('#4c00b0')
                        .setDescription(
                            `<@${donorId}> donated ⏣ ${formatNumber(donationAmount)}\n\n` +
                            `<:purpledot:860074414853586984> Weekly Progress: ⏣ ${formatNumber(usersData[donorId].weeklyDonated)}/${formatNumber(requirement + (usersData[donorId].missedAmount || 0))}`
                        )
                        .setTimestamp();

                    const transactionChannel = await client.channels.fetch('833246120389902356').catch(() => null);
                    if (transactionChannel) await transactionChannel.send({ embeds: [donationEmbed] });

                    setImmediate(() => { updateStatusBoard(client).catch(console.error); });
                    client.trackedDonations.delete(message.id);
                    return;
                }

                // guess.js handles these
                if (['play_new', 'replay', 'answer', 'leaderboard'].includes(interaction.customId)) return;

                // Route to the right handler
                switch (interaction.customId) {
                    case 'risk':
                        return await handleRiskButton(interaction);
                    case 'delete_snipe':
                    case 'delete_esnipe':
                        return await handleDeleteSnipe(interaction);
                    case 'create_channel':
                    case 'rename_channel':
                    case 'view_friends':
                        return await handleChannelButtons(interaction);
                    case 'lb':
                        return await handleLeaderboardButton(interaction);
                    case 'info':
                        return await handleInfoButton(interaction);
                    case 'add_one':
                    case 'add_manual':
                    case 'remove_manual':
                    case 'view_logs':
                    case 'view_overall':
                    case 'reset_weekly':
                        return await handleActivityButtons(interaction);
                }
            }
        } catch (error) {
            if (error.name === 'InteractionAlreadyReplied') {
                console.log('Interaction already acknowledged, ignoring:', error.message);
            } else {
                console.error('Error handling interaction:', error, error.stack);
                try {
                    const replyMethod = interaction.replied ? 'followUp' : 'reply';
                    await interaction[replyMethod]({
                        content: 'There was an error while processing this interaction!',
                        ephemeral: true
                    });
                } catch (followUpError) {
                    console.error('Error sending follow-up message:', followUpError);
                }
            }
        }
    }
};