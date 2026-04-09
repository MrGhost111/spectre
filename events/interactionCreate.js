const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const spectreAI = require('../utils/spectreAI');

const storyDataPath = path.join(__dirname, '../data/storyGame.json');
const YOUR_USER_ID = '753491023208120321'; // Your user ID for testing exception

module.exports = {
    name: 'interactionCreate',
    async execute(client, interaction) {
        // Handle SpectreAI confirmation buttons
        if (interaction.isButton()) {
            const customId = interaction.customId;

            // Check if it's a SpectreAI confirmation button
            if (customId.startsWith('confirm_')) {
                const isConfirm = customId.endsWith('_confirm');
                const isCancel = customId.endsWith('_cancel');

                if (isConfirm || isCancel) {
                    await spectreAI.handleConfirmation(interaction, isConfirm);
                    return;
                }
            }

            // ===========================================
            // STORY GAME BUTTON HANDLERS
            // ===========================================

            // Handle "Finish Submissions" button
            if (customId === 'story_finish') {
                // Check permissions
                if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
                    return interaction.reply({
                        content: '❌ Only moderators with **Kick Members** permission can finish submissions.\n\n💡 **Want to submit your story?** Send it to me via DM (Direct Message)!',
                        ephemeral: true
                    });
                }

                // Load story data
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

                // Confirmation
                const confirmEmbed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('⚠️ Finish Submissions?')
                    .setDescription(`Are you sure you want to finish the submission period and start voting?\n\n**Current submissions:** ${submissionCount} stor${submissionCount === 1 ? 'y' : 'ies'}`)
                    .setFooter({ text: 'This will create a new channel and post all stories for voting.' });

                const confirmRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('story_finish_confirm')
                            .setLabel('Yes, Start Voting')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('✅'),
                        new ButtonBuilder()
                            .setCustomId('story_finish_cancel')
                            .setLabel('Cancel')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('❌')
                    );

                return interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: true });
            }

            // Handle finish confirmation
            if (customId === 'story_finish_confirm') {
                await interaction.deferReply({ ephemeral: true });

                const storyData = JSON.parse(fs.readFileSync(storyDataPath, 'utf8'));
                const guild = interaction.guild;

                try {
                    // Create a new story submissions channel (always creates a fresh one)
                    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
                    const channel = await guild.channels.create({
                        name: `⭐│story-submissions-${timestamp}`,
                        type: ChannelType.GuildText,
                        topic: `Story submissions for: ${storyData.words.join(', ')}${storyData.theme ? ` (${storyData.theme} theme)` : ''}`,
                        permissionOverwrites: [
                            {
                                id: guild.id,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                                deny: [PermissionFlagsBits.SendMessages]
                            }
                        ]
                    });

                    // Save channel ID
                    storyData.votingChannelId = channel.id;
                    storyData.votingActive = true;
                    storyData.storyMessages = {};
                    fs.writeFileSync(storyDataPath, JSON.stringify(storyData, null, 2), 'utf8');

                    // Post introduction
                    const introEmbed = new EmbedBuilder()
                        .setColor('#FFD700')
                        .setTitle(`📖 Story Voting Has Begun!${storyData.theme ? ` (${storyData.theme.toUpperCase()} Theme)` : ''}`)
                        .setDescription(`Vote for your favorite story below!\n\n**Required words were:** ${storyData.words.map(w => `**${w}**`).join(' • ')}\n\n**Rules:**\n• You can only vote once\n• You cannot vote for your own story\n• Click the 👍 button to vote`)
                        .setFooter({ text: `${Object.keys(storyData.submissions).length} stories submitted` })
                        .setTimestamp();

                    await channel.send({ embeds: [introEmbed] });

                    // Post each story
                    const submissions = Object.entries(storyData.submissions);

                    for (const [userId, data] of submissions) {
                        const storyEmbed = new EmbedBuilder()
                            .setColor('#4169E1')
                            .setTitle(`📝 Story by ${data.anonymousName}`)
                            .setDescription(data.story)
                            .setFooter({ text: 'Vote for this story by clicking the button below!' })
                            .setTimestamp(data.timestamp);

                        const voteButton = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`story_vote_${userId}`)
                                    .setLabel('Vote for This Story')
                                    .setStyle(ButtonStyle.Primary)
                                    .setEmoji('👍')
                            );

                        const storyMessage = await channel.send({ embeds: [storyEmbed], components: [voteButton] });

                        // Save message ID for vote counting
                        storyData.storyMessages[userId] = storyMessage.id;
                    }

                    // Update data
                    fs.writeFileSync(storyDataPath, JSON.stringify(storyData, null, 2), 'utf8');

                    // Update original message
                    await interaction.message.edit({
                        content: '✅ **Submission period ended! Voting has started in the new channel.**',
                        embeds: [],
                        components: []
                    });

                    await interaction.editReply({ content: `✅ Successfully created ${channel} and posted all stories!` });

                } catch (error) {
                    console.error('Error creating voting channel:', error);
                    await interaction.editReply({ content: `❌ Error: ${error.message}` });
                }

                return;
            }

            // Handle finish cancel
            if (customId === 'story_finish_cancel') {
                return interaction.update({ content: '❌ Cancelled.', embeds: [], components: [] });
            }

            // Handle story voting
            if (customId.startsWith('story_vote_')) {
                const authorId = customId.replace('story_vote_', '');
                const voterId = interaction.user.id;

                const storyData = JSON.parse(fs.readFileSync(storyDataPath, 'utf8'));

                // Check if voting is active
                if (!storyData.votingActive) {
                    return interaction.reply({ content: '❌ Voting is not active!', ephemeral: true });
                }

                // Check if user is trying to vote for their own story (with exception for you)
                if (voterId === authorId && voterId !== YOUR_USER_ID) {
                    return interaction.reply({ content: '❌ You cannot vote for your own story!', ephemeral: true });
                }

                // Check if user already voted
                if (storyData.votes[voterId]) {
                    const previousVote = storyData.votes[voterId];

                    // Allow you to change your vote for testing
                    if (voterId === YOUR_USER_ID) {
                        // Remove previous vote and allow new one
                        delete storyData.votes[voterId];
                    } else {
                        return interaction.reply({
                            content: `❌ You already voted for **${storyData.submissions[previousVote].anonymousName}**!\n\nYou can only vote once.`,
                            ephemeral: true
                        });
                    }
                }

                // Record vote
                storyData.votes[voterId] = authorId;
                fs.writeFileSync(storyDataPath, JSON.stringify(storyData, null, 2), 'utf8');

                // Special message for you
                if (voterId === YOUR_USER_ID && voterId === authorId) {
                    return interaction.reply({
                        content: `✅ Vote recorded for **${storyData.submissions[authorId].anonymousName}** (Testing mode - you can vote for yourself and change votes)`,
                        ephemeral: true
                    });
                }

                return interaction.reply({
                    content: `✅ Your vote for **${storyData.submissions[authorId].anonymousName}** has been recorded!`,
                    ephemeral: true
                });
            }

            // Handle "Announce Winner" button
            if (customId === 'story_announce') {
                // Check permissions
                if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
                    return interaction.reply({
                        content: '❌ Only moderators with **Kick Members** permission can announce winners.',
                        ephemeral: true
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

                // Confirmation
                const confirmEmbed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('⚠️ Announce Winner?')
                    .setDescription(`Are you sure you want to end voting and announce the winner?\n\n**Total votes cast:** ${voteCount}`)
                    .setFooter({ text: 'This will end the game and reveal all authors.' });

                const confirmRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('story_announce_confirm')
                            .setLabel('Yes, Announce Winner')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('🏆'),
                        new ButtonBuilder()
                            .setCustomId('story_announce_cancel')
                            .setLabel('Cancel')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('❌')
                    );

                return interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: true });
            }

            // Handle announce confirmation
            if (customId === 'story_announce_confirm') {
                await interaction.deferReply({ ephemeral: false });

                const storyData = JSON.parse(fs.readFileSync(storyDataPath, 'utf8'));

                // Count votes for each story
                const voteCounts = {};
                for (const [voter, authorId] of Object.entries(storyData.votes)) {
                    voteCounts[authorId] = (voteCounts[authorId] || 0) + 1;
                }

                // Find winner (highest votes)
                const sortedAuthors = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);

                if (sortedAuthors.length === 0) {
                    return interaction.editReply({ content: '❌ No votes were cast!' });
                }

                const [winnerId, winnerVotes] = sortedAuthors[0];
                const winnerData = storyData.submissions[winnerId];

                // Create winner announcement
                const winnerEmbed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('🏆 Story Competition Winner!')
                    .setDescription(`**Winner:** <@${winnerId}>\n**Anonymous Name:** ${winnerData.anonymousName}\n**Votes Received:** ${winnerVotes}\n\n**Winning Story:**\n${winnerData.story}`)
                    .addFields(
                        { name: '📝 Required Words', value: storyData.words.map(w => `**${w}**`).join(' • ') }
                    )
                    .setFooter({ text: `Total votes: ${Object.keys(storyData.votes).length} | ${storyData.theme ? `Theme: ${storyData.theme}` : 'Random theme'}` })
                    .setTimestamp();

                // Show all results
                let resultsText = '**📊 Full Results:**\n\n';
                for (let i = 0; i < sortedAuthors.length; i++) {
                    const [authorId, votes] = sortedAuthors[i];
                    const data = storyData.submissions[authorId];
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '📝';
                    resultsText += `${medal} **${data.anonymousName}** (<@${authorId}>): ${votes} vote${votes === 1 ? '' : 's'}\n`;
                }

                // Add submissions with no votes
                for (const [authorId, data] of Object.entries(storyData.submissions)) {
                    if (!voteCounts[authorId]) {
                        resultsText += `📝 **${data.anonymousName}** (<@${authorId}>): 0 votes\n`;
                    }
                }

                const resultsEmbed = new EmbedBuilder()
                    .setColor('#4169E1')
                    .setTitle('📊 All Submissions')
                    .setDescription(resultsText);

                await interaction.editReply({ embeds: [winnerEmbed, resultsEmbed] });

                // Reset game
                storyData.active = false;
                storyData.votingActive = false;
                fs.writeFileSync(storyDataPath, JSON.stringify(storyData, null, 2), 'utf8');

                // Update original message
                try {
                    await interaction.message.edit({
                        content: '✅ **Game ended! Winner has been announced.**',
                        embeds: [],
                        components: []
                    });
                } catch (err) {
                    console.error('Error updating original message:', err);
                }

                return;
            }

            // Handle announce cancel
            if (customId === 'story_announce_cancel') {
                return interaction.update({ content: '❌ Cancelled.', embeds: [], components: [] });
            }
        }

        // Handle slash commands
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

        // Handle autocomplete interactions
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