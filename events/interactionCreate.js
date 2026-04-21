const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const { formatFull, formatNumber } = require('../Donations/noteSystem');

const storyDataPath = path.join(__dirname, '../data/storyGame.json');
const YOUR_USER_ID = '753491023208120321';

const PAGE_SIZE = 10;

// ─── Leaderboard helpers ────────────────────────────────────────────────────

function buildLeaderboardEmbed(sorted, page, totalPages, requesterId) {
    const start = page * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, sorted.length);
    const entries = sorted.slice(start, end);

    let description = '';
    for (let i = 0; i < entries.length; i++) {
        const rank = start + i + 1;
        const { userId, total } = entries[i];
        const isYou = userId === requesterId;

        const prefix = rank === 1
            ? '<:winners:1000018706874781806>'
            : '<:purpledot:860074414853586984>';

        const youTag = isYou ? ' **← you**' : '';
        description += `${prefix} **#${rank}** <@${userId}> — ⏣ ${formatFull(total)} *(${formatNumber(total)})*${youTag}\n`;
    }

    return new EmbedBuilder()
        .setTitle('<:lbtest:1064919048242090054>  Donation Leaderboard')
        .setColor('#4c00b0')
        .setDescription(description || 'No data.')
        .setFooter({ text: `Page ${page + 1} of ${totalPages} • Showing #${start + 1}–#${end} of ${sorted.length} users` })
        .setTimestamp();
}

function buildLeaderboardButtons(page, totalPages, userPage, requesterId, interactionUserId) {
    const onFirstPage = page === 0;
    const onLastPage  = page >= totalPages - 1;

    // "My Rank" only works for the original command user
    const isSameUser   = requesterId === interactionUserId;
    const onUserPage   = page === userPage;
    const myRankDisabled = !isSameUser || userPage === -1 || onUserPage;

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`lb_first_${page}`)
            .setLabel('<<')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(onFirstPage),
        new ButtonBuilder()
            .setCustomId(`lb_prev_${page}`)
            .setLabel('<')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(onFirstPage),
        new ButtonBuilder()
            .setCustomId(`lb_myrank_${page}`)
            .setLabel('My Rank')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(myRankDisabled),
        new ButtonBuilder()
            .setCustomId(`lb_next_${page}`)
            .setLabel('>')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(onLastPage),
        new ButtonBuilder()
            .setCustomId(`lb_last_${page}`)
            .setLabel('>>')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(onLastPage),
    );
}

// ─── Main handler ────────────────────────────────────────────────────────────

module.exports = {
    name: 'interactionCreate',
    async execute(client, interaction) {

        if (interaction.isButton()) {
            const customId = interaction.customId;

            // ── SpectreAI confirmation ───────────────────────────────────────
            if (customId.startsWith('confirm_')) {
                const isConfirm = customId.endsWith('_confirm');
                const isCancel  = customId.endsWith('_cancel');
                if (isConfirm || isCancel) {
                    await spectreAI.handleConfirmation(interaction, isConfirm);
                    return;
                }
            }

            // ── Leaderboard buttons ──────────────────────────────────────────
            if (customId.startsWith('lb_')) {
                const cache = client._lbCache?.get(interaction.message.id);

                if (!cache) {
                    return interaction.reply({
                        content: '❌ This leaderboard has expired. Please run `/leaderboard` again.',
                        ephemeral: true,
                    });
                }

                // Prune expired cache entries periodically
                if (client._lbCache) {
                    for (const [id, entry] of client._lbCache.entries()) {
                        if (Date.now() > entry.expiresAt) client._lbCache.delete(id);
                    }
                }

                const { sorted, totalPages, userPage, interactionUserId } = cache;
                const parts   = customId.split('_');   // ['lb', action, currentPage]
                const action  = parts[1];
                const current = parseInt(parts[2], 10);
                let newPage   = current;

                if (action === 'first')  newPage = 0;
                if (action === 'prev')   newPage = Math.max(0, current - 1);
                if (action === 'next')   newPage = Math.min(totalPages - 1, current + 1);
                if (action === 'last')   newPage = totalPages - 1;
                if (action === 'myrank') newPage = userPage >= 0 ? userPage : current;

                const embed   = buildLeaderboardEmbed(sorted, newPage, totalPages, interactionUserId);
                const buttons = buildLeaderboardButtons(newPage, totalPages, userPage, interaction.user.id, interactionUserId);

                return interaction.update({ embeds: [embed], components: [buttons] });
            }

            // ── Story: Finish Submissions ────────────────────────────────────
            if (customId === 'story_finish') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
                    return interaction.reply({
                        content: '❌ Only moderators with **Kick Members** permission can finish submissions.\n\n💡 **Want to submit your story?** Send it to me via DM (Direct Message)!',
                        ephemeral: true,
                    });
                }

                if (!fs.existsSync(storyDataPath)) {
                    return interaction.reply({ content: '❌ No active story game found!', ephemeral: true });
                }

                const storyData = JSON.parse(fs.readFileSync(storyDataPath, 'utf8'));

                if (!storyData.active) {
                    return interaction.reply({ content: '❌ No active story game found!', ephemeral: true });
                }

                const submissionCount = Object.keys(storyData.submissions).length;

                if (submissionCount === 0) {
                    return interaction.reply({ content: '❌ No submissions received yet! Wait for participants to submit their stories.', ephemeral: true });
                }

                const confirmEmbed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('⚠️ Finish Submissions?')
                    .setDescription(`Are you sure you want to finish the submission period and start voting?\n\n**Current submissions:** ${submissionCount} stor${submissionCount === 1 ? 'y' : 'ies'}`)
                    .setFooter({ text: 'This will create a new channel and post all stories for voting.' });

                const confirmRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('story_finish_confirm').setLabel('Yes, Start Voting').setStyle(ButtonStyle.Success).setEmoji('✅'),
                    new ButtonBuilder().setCustomId('story_finish_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger).setEmoji('❌'),
                );

                return interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: true });
            }

            // ── Story: Finish confirm ────────────────────────────────────────
            if (customId === 'story_finish_confirm') {
                await interaction.deferReply({ ephemeral: true });

                const storyData = JSON.parse(fs.readFileSync(storyDataPath, 'utf8'));
                const guild = interaction.guild;

                try {
                    const timestamp = new Date().toISOString().split('T')[0];
                    const channel = await guild.channels.create({
                        name: `⭐│story-submissions-${timestamp}`,
                        type: ChannelType.GuildText,
                        topic: `Story submissions for: ${storyData.words.join(', ')}${storyData.theme ? ` (${storyData.theme} theme)` : ''}`,
                        permissionOverwrites: [
                            {
                                id: guild.id,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                                deny: [PermissionFlagsBits.SendMessages],
                            },
                        ],
                    });

                    storyData.votingChannelId = channel.id;
                    storyData.votingActive    = true;
                    storyData.storyMessages   = {};
                    fs.writeFileSync(storyDataPath, JSON.stringify(storyData, null, 2), 'utf8');

                    const introEmbed = new EmbedBuilder()
                        .setColor('#FFD700')
                        .setTitle(`📖 Story Voting Has Begun!${storyData.theme ? ` (${storyData.theme.toUpperCase()} Theme)` : ''}`)
                        .setDescription(`Vote for your favorite story below!\n\n**Required words were:** ${storyData.words.map(w => `**${w}**`).join(' • ')}\n\n**Rules:**\n• You can only vote once\n• You cannot vote for your own story\n• Click the 👍 button to vote`)
                        .setFooter({ text: `${Object.keys(storyData.submissions).length} stories submitted` })
                        .setTimestamp();

                    await channel.send({ embeds: [introEmbed] });

                    for (const [userId, data] of Object.entries(storyData.submissions)) {
                        const storyEmbed = new EmbedBuilder()
                            .setColor('#4169E1')
                            .setTitle(`📝 Story by ${data.anonymousName}`)
                            .setDescription(data.story)
                            .setFooter({ text: 'Vote for this story by clicking the button below!' })
                            .setTimestamp(data.timestamp);

                        const voteButton = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`story_vote_${userId}`)
                                .setLabel('Vote for This Story')
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji('👍'),
                        );

                        const storyMessage = await channel.send({ embeds: [storyEmbed], components: [voteButton] });
                        storyData.storyMessages[userId] = storyMessage.id;
                    }

                    fs.writeFileSync(storyDataPath, JSON.stringify(storyData, null, 2), 'utf8');

                    await interaction.message.edit({ content: '✅ **Submission period ended! Voting has started in the new channel.**', embeds: [], components: [] });
                    await interaction.editReply({ content: `✅ Successfully created ${channel} and posted all stories!` });

                } catch (error) {
                    console.error('Error creating voting channel:', error);
                    await interaction.editReply({ content: `❌ Error: ${error.message}` });
                }

                return;
            }

            // ── Story: Finish cancel ─────────────────────────────────────────
            if (customId === 'story_finish_cancel') {
                return interaction.update({ content: '❌ Cancelled.', embeds: [], components: [] });
            }

            // ── Story: Vote ──────────────────────────────────────────────────
            if (customId.startsWith('story_vote_')) {
                const authorId = customId.replace('story_vote_', '');
                const voterId  = interaction.user.id;

                const storyData = JSON.parse(fs.readFileSync(storyDataPath, 'utf8'));

                if (!storyData.votingActive) {
                    return interaction.reply({ content: '❌ Voting is not active!', ephemeral: true });
                }

                if (voterId === authorId && voterId !== YOUR_USER_ID) {
                    return interaction.reply({ content: '❌ You cannot vote for your own story!', ephemeral: true });
                }

                if (storyData.votes[voterId]) {
                    const previousVote = storyData.votes[voterId];
                    if (voterId === YOUR_USER_ID) {
                        delete storyData.votes[voterId];
                    } else {
                        return interaction.reply({
                            content: `❌ You already voted for **${storyData.submissions[previousVote].anonymousName}**!\n\nYou can only vote once.`,
                            ephemeral: true,
                        });
                    }
                }

                storyData.votes[voterId] = authorId;
                fs.writeFileSync(storyDataPath, JSON.stringify(storyData, null, 2), 'utf8');

                if (voterId === YOUR_USER_ID && voterId === authorId) {
                    return interaction.reply({
                        content: `✅ Vote recorded for **${storyData.submissions[authorId].anonymousName}** (Testing mode - you can vote for yourself and change votes)`,
                        ephemeral: true,
                    });
                }

                return interaction.reply({
                    content: `✅ Your vote for **${storyData.submissions[authorId].anonymousName}** has been recorded!`,
                    ephemeral: true,
                });
            }

            // ── Story: Announce Winner ───────────────────────────────────────
            if (customId === 'story_announce') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
                    return interaction.reply({
                        content: '❌ Only moderators with **Kick Members** permission can announce winners.',
                        ephemeral: true,
                    });
                }

                const storyData = JSON.parse(fs.readFileSync(storyDataPath, 'utf8'));

                if (!storyData.votingActive) {
                    return interaction.reply({ content: '❌ Voting hasn\'t started yet! Use "Finish Submissions" first.', ephemeral: true });
                }

                const voteCount = Object.keys(storyData.votes).length;

                if (voteCount === 0) {
                    return interaction.reply({ content: '❌ No votes have been cast yet!', ephemeral: true });
                }

                const confirmEmbed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('⚠️ Announce Winner?')
                    .setDescription(`Are you sure you want to end voting and announce the winner?\n\n**Total votes cast:** ${voteCount}`)
                    .setFooter({ text: 'This will end the game and reveal all authors.' });

                const confirmRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('story_announce_confirm').setLabel('Yes, Announce Winner').setStyle(ButtonStyle.Success).setEmoji('🏆'),
                    new ButtonBuilder().setCustomId('story_announce_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger).setEmoji('❌'),
                );

                return interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: true });
            }

            // ── Story: Announce confirm ──────────────────────────────────────
            if (customId === 'story_announce_confirm') {
                await interaction.deferReply({ ephemeral: false });

                const storyData = JSON.parse(fs.readFileSync(storyDataPath, 'utf8'));

                const voteCounts = {};
                for (const [, authorId] of Object.entries(storyData.votes)) {
                    voteCounts[authorId] = (voteCounts[authorId] || 0) + 1;
                }

                const sortedAuthors = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);

                if (sortedAuthors.length === 0) {
                    return interaction.editReply({ content: '❌ No votes were cast!' });
                }

                const [winnerId, winnerVotes] = sortedAuthors[0];
                const winnerData = storyData.submissions[winnerId];

                const winnerEmbed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('🏆 Story Competition Winner!')
                    .setDescription(`**Winner:** <@${winnerId}>\n**Anonymous Name:** ${winnerData.anonymousName}\n**Votes Received:** ${winnerVotes}\n\n**Winning Story:**\n${winnerData.story}`)
                    .addFields({ name: '📝 Required Words', value: storyData.words.map(w => `**${w}**`).join(' • ') })
                    .setFooter({ text: `Total votes: ${Object.keys(storyData.votes).length} | ${storyData.theme ? `Theme: ${storyData.theme}` : 'Random theme'}` })
                    .setTimestamp();

                let resultsText = '**📊 Full Results:**\n\n';
                for (let i = 0; i < sortedAuthors.length; i++) {
                    const [authorId, votes] = sortedAuthors[i];
                    const data  = storyData.submissions[authorId];
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '<:purpledot:860074414853586984>';
                    resultsText += `${medal} **${data.anonymousName}** (<@${authorId}>): ${votes} vote${votes === 1 ? '' : 's'}\n`;
                }

                for (const [authorId, data] of Object.entries(storyData.submissions)) {
                    if (!voteCounts[authorId]) {
                        resultsText += `<:purpledot:860074414853586984> **${data.anonymousName}** (<@${authorId}>): 0 votes\n`;
                    }
                }

                const resultsEmbed = new EmbedBuilder()
                    .setColor('#4169E1')
                    .setTitle('📊 All Submissions')
                    .setDescription(resultsText);

                await interaction.editReply({ embeds: [winnerEmbed, resultsEmbed] });

                storyData.active       = false;
                storyData.votingActive = false;
                fs.writeFileSync(storyDataPath, JSON.stringify(storyData, null, 2), 'utf8');

                try {
                    await interaction.message.edit({ content: '✅ **Game ended! Winner has been announced.**', embeds: [], components: [] });
                } catch (err) {
                    console.error('Error updating original message:', err);
                }

                return;
            }

            // ── Story: Announce cancel ───────────────────────────────────────
            if (customId === 'story_announce_cancel') {
                return interaction.update({ content: '❌ Cancelled.', embeds: [], components: [] });
            }
        }

        // ── Slash commands ───────────────────────────────────────────────────
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`Error executing ${interaction.commandName}`);
                console.error(error);

                const errorMessage = { content: 'There was an error while executing this command!', ephemeral: true };

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        }

        // ── Autocomplete ─────────────────────────────────────────────────────
        if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);

            if (!command || !command.autocomplete) {
                console.error(`No autocomplete handler for ${interaction.commandName} was found.`);
                return;
            }

            try {
                await command.autocomplete(interaction);
            } catch (error) {
                console.error(`Error handling autocomplete for ${interaction.commandName}`);
                console.error(error);
            }
        }
    },
};
