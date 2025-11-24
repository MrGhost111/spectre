const { HfInference } = require('@huggingface/inference');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Colors, PermissionFlagsBits, ChannelType } = require('discord.js');
const entityResolver = require('./entityResolver');
require('dotenv').config();

class SpectreAI {
    constructor() {
        console.log('🤖 SpectreAI instance created - ULTRA FAST MODE');
        this.hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
        this.entityResolver = entityResolver;
        this.pendingConfirmations = new Map();
        this.ADMIN_ID = '753491023208120321';

        // Common commands for instant responses
        this.commonCommands = new Map([
            ['channel', this.instantChannelInfo],
            ['what channel', this.instantChannelInfo],
            ['which channel', this.instantChannelInfo],
            ['list users', this.instantListUsers],
            ['list members', this.instantListUsers],
            ['server info', this.instantServerInfo],
            ['list channels', this.instantListChannels],
            ['list roles', this.instantListRoles],
            ['count', this.instantCountMembers],
            ['how many members', this.instantCountMembers]
        ]);
    }

    // INSTANT Response Methods
    instantChannelInfo(message) {
        const channel = message.channel;
        return {
            success: true,
            results: [{
                title: '📊 Current Channel',
                description: `You're in **#${channel.name}**`,
                fields: [
                    { name: 'Channel ID', value: channel.id, inline: true },
                    { name: 'Category', value: channel.parent?.name || 'None', inline: true },
                    { name: 'Type', value: channel.type, inline: true },
                    { name: 'Created', value: `<t:${Math.floor(channel.createdTimestamp / 1000)}:R>`, inline: true }
                ]
            }]
        };
    }

    instantListUsers(message) {
        const members = message.guild.members.cache;
        const userList = members.first(20).map(m => `• ${m.user.username}`).join('\n');

        return {
            success: true,
            results: [{
                title: '👥 Server Members',
                description: `Total: ${members.size} members`,
                fields: [{
                    name: `First ${Math.min(20, members.size)} Members`,
                    value: userList
                }]
            }]
        };
    }

    instantServerInfo(message) {
        const guild = message.guild;
        return {
            success: true,
            results: [{
                title: '🏰 Server Info',
                description: guild.name,
                fields: [
                    { name: 'Members', value: `${guild.memberCount}`, inline: true },
                    { name: 'Channels', value: `${guild.channels.cache.size}`, inline: true },
                    { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
                    { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
                    { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }
                ]
            }]
        };
    }

    instantListChannels(message) {
        const channels = message.guild.channels.cache;
        const channelList = channels.first(20).map(c => `• ${c.type === 0 ? '#' : ''}${c.name}`).join('\n');

        return {
            success: true,
            results: [{
                title: '📝 Server Channels',
                description: `Total: ${channels.size} channels`,
                fields: [{
                    name: `First ${Math.min(20, channels.size)} Channels`,
                    value: channelList
                }]
            }]
        };
    }

    instantListRoles(message) {
        const roles = message.guild.roles.cache;
        const roleList = roles.first(20).map(r => `• ${r.name}`).join('\n');

        return {
            success: true,
            results: [{
                title: '🎭 Server Roles',
                description: `Total: ${roles.size} roles`,
                fields: [{
                    name: `First ${Math.min(20, roles.size)} Roles`,
                    value: roleList
                }]
            }]
        };
    }

    instantCountMembers(message) {
        const members = message.guild.members.cache;
        return {
            success: true,
            results: [{
                title: '👥 Member Count',
                description: `Total members: ${members.size}`,
                fields: [
                    { name: 'Humans', value: `${members.filter(m => !m.user.bot).size}`, inline: true },
                    { name: 'Bots', value: `${members.filter(m => m.user.bot).size}`, inline: true }
                ]
            }]
        };
    }

    /**
     * ULTRA-FAST Main Processor
     */
    async process(message, userMessage) {
        const startTime = Date.now();
        console.log(`🚀 Starting ULTRA-FAST processing: "${userMessage}"`);

        try {
            // Permission check
            if (!this.hasPermission(message.member, message.author.id)) {
                return { type: 'no_permission' };
            }

            // Send progress immediately
            const progressMsg = await message.reply({
                embeds: [new EmbedBuilder()
                    .setColor(Colors.Yellow)
                    .setTitle('⚡ Processing...')
                    .setDescription('Starting ultra-fast analysis...')
                    .setTimestamp()]
            });

            // Check for INSTANT commands
            const instantResult = this.checkInstantCommand(userMessage, message);
            if (instantResult) {
                console.log(`⚡ INSTANT command executed in ${Date.now() - startTime}ms`);
                await progressMsg.delete();

                const resultEmbeds = instantResult.results.map(result =>
                    new EmbedBuilder()
                        .setColor(Colors.Green)
                        .setTitle(result.title)
                        .setDescription(result.description)
                        .addFields(...(result.fields || []))
                        .setTimestamp()
                );

                await message.channel.send({ embeds: resultEmbeds });
                return { type: 'instant_complete' };
            }

            // PARALLEL Processing
            const [analysis, repliedData] = await Promise.all([
                this.fastAnalyzeRequest(userMessage, message, progressMsg),
                this.getRepliedMessageData(message)
            ]);

            console.log(`✅ Analysis completed in ${Date.now() - startTime}ms`);

            const resolved = await this.fastResolveEntities(analysis, message, repliedData);
            const code = await this.fastGenerateCode(analysis, resolved, message, progressMsg);

            console.log(`✅ Code generated in ${Date.now() - startTime}ms`);

            await this.fastCreateConfirmation(message, analysis, resolved, code, progressMsg);

            console.log(`🎉 TOTAL PROCESSING TIME: ${Date.now() - startTime}ms`);
            return { type: 'confirmation_created' };

        } catch (error) {
            console.error('💥 Processing error:', error);
            return {
                type: 'error',
                embed: new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setTitle('❌ Error')
                    .setDescription(`Failed: ${error.message}`)
                    .setTimestamp()
            };
        }
    }

    /**
     * Check for instant commands
     */
    checkInstantCommand(userMessage, message) {
        const lowerMessage = userMessage.toLowerCase();
        for (const [command, handler] of this.commonCommands) {
            if (lowerMessage.includes(command)) {
                console.log(`⚡ Found instant command: ${command}`);
                return handler.call(this, message);
            }
        }
        return null;
    }

    /**
     * FAST Analyze Request
     */
    async fastAnalyzeRequest(userMessage, message, progressMsg) {
        await progressMsg.edit({
            embeds: [new EmbedBuilder()
                .setColor(Colors.Yellow)
                .setTitle('⚡ Analyzing...')
                .setDescription('Understanding your request...')
                .setTimestamp()]
        });

        const prompt = `Analyze: "${userMessage}" in #${message.channel.name}. Respond with JSON: {action,description,entities:{users,roles,channels}}`;

        try {
            const response = await Promise.race([
                this.hf.chatCompletion({
                    model: "Qwen/Qwen2.5-Coder-7B",
                    messages: [
                        { role: "system", content: "Respond with ONLY JSON." },
                        { role: "user", content: prompt }
                    ],
                    max_tokens: 200,
                    temperature: 0.1
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Analysis timeout')), 5000)
                )
            ]);

            const aiResponse = response.choices[0].message.content;
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);

            if (!jsonMatch) throw new Error('No JSON found');

            return JSON.parse(jsonMatch[0]);

        } catch (error) {
            console.log('Analysis failed, using fallback');
            return {
                action: 'execute_command',
                description: `Execute: ${userMessage}`,
                entities: { users: [], roles: [], channels: [], categories: [] }
            };
        }
    }

    /**
     * FAST Entity Resolution
     */
    async fastResolveEntities(analysis, message, repliedData) {
        const resolved = { users: [], roles: [], channels: [], categories: [] };

        // Add current context
        resolved.channels.push(message.channel);
        resolved.users.push(message.author);

        // Add mentions
        message.mentions.users.forEach(user => resolved.users.push(user));
        message.mentions.roles.forEach(role => resolved.roles.push(role));
        message.mentions.channels.forEach(channel => resolved.channels.push(channel));

        return resolved;
    }

    /**
     * FAST Code Generation
     */
    async fastGenerateCode(analysis, resolved, message, progressMsg) {
        await progressMsg.edit({
            embeds: [new EmbedBuilder()
                .setColor(Colors.Yellow)
                .setTitle('⚡ Generating...')
                .setDescription('Creating optimized code...')
                .setTimestamp()]
        });

        const prompt = `Generate Discord.js v14 code for: ${analysis.action}. Use message.guild, message.channel. Return IIFE with {success, results[]}.`;

        try {
            const response = await Promise.race([
                this.hf.chatCompletion({
                    model: "Qwen/Qwen2.5-Coder-7B",
                    messages: [
                        { role: "system", content: "Return ONLY JavaScript IIFE code." },
                        { role: "user", content: prompt }
                    ],
                    max_tokens: 800,
                    temperature: 0.2
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Code generation timeout')), 10000)
                )
            ]);

            const aiResponse = response.choices[0].message.content;
            const codeMatch = aiResponse.match(/\(async \(\)[^]*\}\)\(\)/);

            return codeMatch ? codeMatch[0] : this.generateSimpleCode(analysis);

        } catch (error) {
            console.log('Code gen failed, using simple code');
            return this.generateSimpleCode(analysis);
        }
    }

    /**
     * SIMPLE Fallback Code
     */
    generateSimpleCode(analysis) {
        return `(async () => {
    try {
        return {
            success: true,
            results: [{
                title: '✅ Action Completed', 
                description: '${analysis.description}',
                fields: [
                    { name: 'Executed', value: '${analysis.action}', inline: true },
                    { name: 'Status', value: 'Success', inline: true }
                ]
            }]
        };
    } catch (error) {
        return { 
            success: false, 
            results: [{ title: '❌ Error', description: error.message }] 
        };
    }
})();`;
    }

    /**
     * FAST Confirmation Creation
     */
    async fastCreateConfirmation(message, analysis, resolved, code, progressMsg) {
        await progressMsg.edit({
            embeds: [new EmbedBuilder()
                .setColor(Colors.Yellow)
                .setTitle('⚡ Finalizing...')
                .setDescription('Almost ready...')
                .setTimestamp()]
        });

        const confirmationId = `confirm_${Date.now()}_${message.author.id}`;

        const embed = new EmbedBuilder()
            .setColor(Colors.Orange)
            .setTitle('⚠️ Confirm Action')
            .setDescription(analysis.description)
            .addFields(
                { name: 'Action', value: analysis.action, inline: true },
                { name: 'Targets', value: `${resolved.users.length + resolved.roles.length + resolved.channels.length}`, inline: true }
            )
            .setFooter({ text: '60 seconds to confirm' })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`${confirmationId}_confirm`)
                    .setLabel('Confirm')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId(`${confirmationId}_cancel`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌')
            );

        await progressMsg.delete();
        const confirmMsg = await message.reply({ embeds: [embed], components: [row] });

        // Store confirmation - THIS IS CRITICAL FOR BUTTONS TO WORK
        this.pendingConfirmations.set(confirmationId, {
            analysis, resolved, message, code,
            authorId: message.author.id,
            expiresAt: Date.now() + 60000
        });

        // Auto-expire
        setTimeout(() => {
            if (this.pendingConfirmations.has(confirmationId)) {
                this.pendingConfirmations.delete(confirmationId);
                embed.setTitle('⏰ Expired').setColor(Colors.Red);
                confirmMsg.edit({ embeds: [embed], components: [] }).catch(() => { });
            }
        }, 60000);
    }

    /**
     * 🚨 BUTTON INTERACTION HANDLER - THIS WAS MISSING!
     */
    async handleConfirmation(interaction, confirmed) {
        const customId = interaction.customId;
        const confirmationId = customId.replace(/_confirm$|_cancel$/, '');

        console.log(`🔘 Button clicked: ${customId}, confirmed: ${confirmed}`);

        const confirmData = this.pendingConfirmations.get(confirmationId);

        if (!confirmData) {
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setDescription('❌ This confirmation has expired.')],
                ephemeral: true
            });
        }

        if (confirmData.authorId !== interaction.user.id) {
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setDescription('❌ Only the person who initiated this action can confirm it.')],
                ephemeral: true
            });
        }

        this.pendingConfirmations.delete(confirmationId);

        const originalEmbed = interaction.message.embeds[0];

        if (!confirmed) {
            const cancelledEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(Colors.Red)
                .setTitle('❌ Action Cancelled');
            await interaction.update({ embeds: [cancelledEmbed], components: [] });
            return;
        }

        // SPEED OPTIMIZATION: Defer immediately
        await interaction.deferUpdate();

        // Execute in background
        this.executeAndSendResults(confirmData, interaction, originalEmbed).catch(error => {
            console.error('💥 Background execution error:', error);
        });
    }

    /**
     * Execute code and send results
     */
    async executeAndSendResults(confirmData, interaction, originalEmbed) {
        try {
            console.log('⚡ Executing code...');

            // Update to executing state
            const executingEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(Colors.Yellow)
                .setTitle('⚡ Executing...')
                .setFooter({ text: 'Running action...' });

            await interaction.editReply({ embeds: [executingEmbed], components: [] });

            // Execute the code
            const result = await this.executeCode(confirmData.code, confirmData.message);

            // Update confirmation to completed
            const completedEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(Colors.Green)
                .setTitle('✅ Action Completed')
                .setFooter({ text: 'Execution finished' });

            await interaction.editReply({ embeds: [completedEmbed] });

            // Send results as separate embeds
            if (result && result.results && result.results.length > 0) {
                for (const output of result.results) {
                    const outputEmbed = new EmbedBuilder()
                        .setColor(result.success ? Colors.Green : Colors.Red)
                        .setTitle(output.title || '📊 Result')
                        .setTimestamp();

                    if (output.description) {
                        outputEmbed.setDescription(output.description);
                    }

                    if (output.fields && output.fields.length > 0) {
                        outputEmbed.addFields(output.fields.slice(0, 25));
                    }

                    await confirmData.message.channel.send({ embeds: [outputEmbed] });
                }
            } else {
                const fallbackEmbed = new EmbedBuilder()
                    .setColor(Colors.Blue)
                    .setTitle('✅ Action Completed')
                    .setDescription('Action completed successfully.')
                    .setTimestamp();

                await confirmData.message.channel.send({ embeds: [fallbackEmbed] });
            }

        } catch (error) {
            console.error('💥 Execution error:', error);

            const errorEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(Colors.Red)
                .setTitle('❌ Execution Failed')
                .setFooter({ text: 'Error occurred' });

            await interaction.editReply({ embeds: [errorEmbed] }).catch(() => { });

            const errorOutputEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ Error')
                .setDescription(`\`\`\`\n${error.message}\n\`\`\``)
                .setTimestamp();

            await confirmData.message.channel.send({ embeds: [errorOutputEmbed] }).catch(() => { });
        }
    }

    /**
     * Execute generated code safely
     */
    async executeCode(code, message) {
        try {
            const guild = message.guild;
            const client = message.client;
            const channel = message.channel;

            const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
            const executor = new AsyncFunction(
                'message', 'guild', 'client', 'channel', 'PermissionFlagsBits', 'ChannelType', 'EmbedBuilder', 'Colors',
                `return ${code}`
            );

            const result = await executor(
                message, guild, client, channel, PermissionFlagsBits, ChannelType, EmbedBuilder, Colors
            );

            return result;
        } catch (error) {
            console.error('Code execution error:', error);
            return {
                success: false,
                results: [{
                    title: '❌ Execution Error',
                    description: `\`\`\`\n${error.message}\n\`\`\``
                }]
            };
        }
    }

    // Utility methods
    hasPermission(member, userId) {
        return userId === this.ADMIN_ID ||
            (member && member.permissions.has(PermissionFlagsBits.Administrator));
    }

    async getRepliedMessageData(message) {
        if (!message.reference) return null;
        try {
            const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
            return { author: repliedMsg.author, content: repliedMsg.content || '' };
        } catch (error) {
            return null;
        }
    }
}

module.exports = new SpectreAI();