const { HfInference } = require('@huggingface/inference');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Colors, PermissionFlagsBits, ChannelType } = require('discord.js');
const entityResolver = require('./entityResolver');
require('dotenv').config();

class SpectreAI {
    constructor() {
        console.log('🤖 SpectreAI instance created');
        this.hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
        this.entityResolver = entityResolver;
        this.pendingConfirmations = new Map();
        this.ADMIN_ID = '753491023208120321';

        // Cache for frequent requests
        this.requestCache = new Map();
        this.cacheTimeout = 60000; // 1 minute cache
    }

    /**
     * Check if user has permission (admin or specific user)
     */
    hasPermission(member, userId) {
        if (userId === this.ADMIN_ID) return true;
        if (member && member.permissions.has('Administrator')) return true;
        return false;
    }

    /**
     * Get cache key for request
     */
    getCacheKey(message, userMessage) {
        return `${message.guild.id}:${userMessage.toLowerCase().trim()}`;
    }

    /**
     * Get replied message data if exists
     */
    async getRepliedMessageData(message) {
        if (!message.reference) return null;

        try {
            const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
            return {
                author: repliedMsg.author,
                content: repliedMsg.content || '',
                embeds: repliedMsg.embeds.map(embed => ({
                    title: embed.title || '',
                    description: embed.description || '',
                    fields: embed.fields.map(f => ({ name: f.name, value: f.value }))
                }))
            };
        } catch (error) {
            console.error('Failed to fetch replied message:', error);
            return null;
        }
    }

    /**
     * Build context information
     */
    buildContextInfo(message) {
        let context = `- Current Channel: #${message.channel.name} (ID: ${message.channel.id})`;
        context += `\n- Message Author: ${message.author.username} (ID: ${message.author.id})`;

        if (message.channel.parent) {
            context += `\n- Current Category: ${message.channel.parent.name} (ID: ${message.channel.parent.id})`;
        }

        if (message.reference) {
            context += `\n- User is replying to a message`;
        }

        return context;
    }

    /**
     * Resolve entities with replied message support
     */
    async resolveEntities(analysis, message, repliedData) {
        const resolved = {
            users: [],
            roles: [],
            channels: [],
            categories: []
        };

        // Handle context-based entities first
        if (analysis.usesContext) {
            if (analysis.usesContext.currentChannel) {
                resolved.channels.push(message.channel);
            }
            if (analysis.usesContext.currentCategory && message.channel.parent) {
                resolved.categories.push(message.channel.parent);
            }
            if (analysis.usesContext.messageAuthor) {
                resolved.users.push(message.author);
            }
            if (analysis.usesContext.repliedUser && repliedData) {
                if (!resolved.users.find(u => u.id === repliedData.author.id)) {
                    resolved.users.push(repliedData.author);
                }
            }
        }

        // Resolve entity names using fuzzy search
        if (analysis.entities.users) {
            for (const userName of analysis.entities.users) {
                const user = await this.entityResolver.findUser(userName, message.guild);
                if (user && !resolved.users.find(u => u.id === user.id)) {
                    resolved.users.push(user);
                }
            }
        }

        if (analysis.entities.roles) {
            for (const roleName of analysis.entities.roles) {
                const role = this.entityResolver.findRole(roleName, message.guild);
                if (role && !resolved.roles.find(r => r.id === role.id)) {
                    resolved.roles.push(role);
                }
            }
        }

        if (analysis.entities.channels) {
            for (const channelName of analysis.entities.channels) {
                const channel = this.entityResolver.findChannel(channelName, message.guild);
                if (channel && !resolved.channels.find(c => c.id === channel.id)) {
                    resolved.channels.push(channel);
                }
            }
        }

        if (analysis.entities.categories) {
            for (const categoryName of analysis.entities.categories) {
                const category = this.entityResolver.findCategory(categoryName, message.guild);
                if (category && !resolved.categories.find(c => c.id === category.id)) {
                    resolved.categories.push(category);
                }
            }
        }

        // Check mentions in original message
        if (message.mentions.users.size > 0) {
            message.mentions.users.forEach(user => {
                if (!resolved.users.find(u => u.id === user.id)) {
                    resolved.users.push(user);
                }
            });
        }

        if (message.mentions.roles.size > 0) {
            message.mentions.roles.forEach(role => {
                if (!resolved.roles.find(r => r.id === role.id)) {
                    resolved.roles.push(role);
                }
            });
        }

        if (message.mentions.channels.size > 0) {
            message.mentions.channels.forEach(channel => {
                if (!resolved.channels.find(c => c.id === channel.id)) {
                    resolved.channels.push(channel);
                }
            });
        }

        return resolved;
    }

    /**
     * Analyze request with caching
     */
    async analyzeRequest(message, userMessage, repliedData, progressMsg) {
        const cacheKey = this.getCacheKey(message, userMessage);
        const cached = this.requestCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            console.log('✅ Using cached analysis');
            return cached.data;
        }

        await progressMsg.edit({
            embeds: [new EmbedBuilder()
                .setColor(Colors.Yellow)
                .setTitle('⏳ Step 1/3: Analyzing Request')
                .setDescription('Understanding what you want to do...')
                .setTimestamp()]
        });

        const contextInfo = this.buildContextInfo(message);

        // OPTIMIZED PROMPT - Much shorter for faster processing
        const prompt = `Analyze: "${userMessage}"

Context:
${contextInfo}

${repliedData ? `Replying to: ${repliedData.author.username}` : ''}

Respond with JSON: {action,description,entities:{users,roles,channels,categories},parameters,usesContext:{currentChannel,currentCategory,repliedUser,messageAuthor}}`;

        try {
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-7B", // FASTER MODEL
                messages: [
                    { role: "system", content: "You are a Discord action analyzer. Respond only with valid JSON." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 400, // REDUCED TOKENS
                temperature: 0.1
            });

            const aiResponse = response.choices[0].message.content;
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);

            if (!jsonMatch) {
                throw new Error('Failed to parse AI response');
            }

            const analysis = JSON.parse(jsonMatch[0]);

            // Cache the result
            this.requestCache.set(cacheKey, {
                data: analysis,
                timestamp: Date.now()
            });

            return analysis;
        } catch (error) {
            console.error('Request analysis error:', error);
            throw error;
        }
    }

    /**
     * Generate Discord.js v14 code with optimized prompt
     */
    async generateCode(analysis, resolved, message, repliedData, progressMsg) {
        await progressMsg.edit({
            embeds: [new EmbedBuilder()
                .setColor(Colors.Yellow)
                .setTitle('⏳ Step 2/3: Generating Code')
                .setDescription('Creating execution plan...')
                .setTimestamp()]
        });

        // OPTIMIZED PROMPT - Shorter and more direct
        const prompt = `Generate Discord.js v14 code for: ${analysis.action}

Targets:
- Users: ${resolved.users.map(u => `${u.username} (${u.id})`).join(', ') || 'none'}
- Channels: ${resolved.channels.map(c => `${c.name} (${c.id})`).join(', ') || 'none'}
- Roles: ${resolved.roles.map(r => `${r.name} (${r.id})`).join(', ') || 'none'}
- Categories: ${resolved.categories.map(c => `${c.name} (${c.id})`).join(', ') || 'none'}

Params: ${JSON.stringify(analysis.parameters)}
Context: guild=${message.guild.id}, channel=${message.channel.id}

Rules:
- Return {success, results[]} in IIFE
- Use: guild, client, channel, message, PermissionFlagsBits, ChannelType, EmbedBuilder, Colors
- Use cache first (guild.members.cache, channel.messages.cache)
- Handle Discord limits (split large outputs)
- No require() statements`;

        try {
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-7B", // FASTER MODEL
                messages: [
                    { role: "system", content: "You are a Discord.js v14 code generator. Generate concise, executable JavaScript with proper error handling." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 1000, // REDUCED FROM 1500
                temperature: 0.2
            });

            const aiResponse = response.choices[0].message.content;
            const codeMatch = aiResponse.match(/```(?:javascript)?\s*([\s\S]*?)```/) || aiResponse.match(/(\(async \(\)[^]*\}\)\))/);

            if (codeMatch) {
                return codeMatch[1].trim();
            }

            if (aiResponse.includes('(async ()')) {
                return aiResponse.trim();
            }

            throw new Error('Failed to extract code from AI response');
        } catch (error) {
            console.error('Code generation error:', error);
            throw error;
        }
    }

    /**
     * Execute generated code safely with all dependencies injected
     */
    async executeCode(code, message) {
        try {
            // Inject all required dependencies into the execution context
            const guild = message.guild;
            const client = message.client;
            const channel = message.channel;

            // Create async function with injected variables
            const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
            const executor = new AsyncFunction(
                'message',
                'guild',
                'client',
                'channel',
                'PermissionFlagsBits',
                'ChannelType',
                'EmbedBuilder',
                'Colors',
                `return ${code}`
            );

            const result = await executor(
                message,
                guild,
                client,
                channel,
                PermissionFlagsBits,
                ChannelType,
                EmbedBuilder,
                Colors
            );

            return result;
        } catch (error) {
            console.error('Code execution error:', error);
            return {
                success: false,
                results: [{
                    title: '❌ Execution Error',
                    description: `\`\`\`\n${error.message}\n\`\`\`\n\nThe code failed to execute. This might be due to:\n• Missing permissions\n• Invalid entity references\n• Discord API rate limits\n\nPlease try rephrasing your request.`
                }]
            };
        }
    }

    /**
     * Check for dangerous actions
     */
    isDangerousAction(analysis, resolved) {
        const dangers = {
            isBlocked: false,
            reasons: []
        };

        // Check for mass deletion/ban (>5 targets)
        const action = analysis.action.toLowerCase();
        const destructiveKeywords = ['delete', 'remove', 'ban', 'kick'];

        if (destructiveKeywords.some(keyword => action.includes(keyword))) {
            const totalTargets = (resolved.channels?.length || 0) +
                (resolved.users?.length || 0) +
                (resolved.roles?.length || 0);

            if (totalTargets > 5) {
                dangers.isBlocked = true;
                dangers.reasons.push(`🚨 Mass ${action} detected (${totalTargets} targets, max: 5)`);
            }
        }

        // Check for message spam in parameters (>10 messages)
        if (analysis.parameters) {
            const messageCount = parseInt(analysis.parameters.count) ||
                parseInt(analysis.parameters.amount) ||
                parseInt(analysis.parameters.messages) || 0;

            if (messageCount > 10) {
                dangers.isBlocked = true;
                dangers.reasons.push(`⚠️ Attempting to send ${messageCount} messages (max: 10)`);
            }
        }

        return dangers;
    }

    /**
     * Create confirmation embed with all details
     */
    async createConfirmation(message, analysis, resolved, repliedData, code, progressMsg) {
        await progressMsg.edit({
            embeds: [new EmbedBuilder()
                .setColor(Colors.Yellow)
                .setTitle('⏳ Step 3/3: Preparing Confirmation')
                .setDescription('Building action details...')
                .setTimestamp()]
        });

        const confirmationId = `confirm_${Date.now()}_${message.author.id}`;
        const dangers = this.isDangerousAction(analysis, resolved);

        const embed = new EmbedBuilder()
            .setColor(dangers.isBlocked ? Colors.Red : Colors.Orange)
            .setTitle(dangers.isBlocked ? '🚫 Action Blocked' : '⚠️ Confirmation Required')
            .setFooter({ text: dangers.isBlocked ? 'This action has been blocked for safety.' : 'You have 60 seconds to respond.' })
            .setTimestamp();

        // Show what AI understood
        embed.addFields({
            name: '🎯 What I Understood',
            value: analysis.description,
            inline: false
        });

        // Show detailed execution steps
        if (analysis.detailedSteps && analysis.detailedSteps.length > 0) {
            let stepsText = analysis.detailedSteps.map((step, i) => `${i + 1}. ${step}`).join('\n');

            if (stepsText.length > 1024) {
                const chunks = this.splitText(stepsText, 1024);
                chunks.forEach((chunk, i) => {
                    embed.addFields({
                        name: i === 0 ? '📋 What Bot Will Do' : '📋 Continued',
                        value: chunk,
                        inline: false
                    });
                });
            } else {
                embed.addFields({
                    name: '📋 What Bot Will Do',
                    value: stepsText,
                    inline: false
                });
            }
        }

        // Show affected entities
        if (resolved.users.length > 0) {
            const userList = resolved.users.map(u => `• ${u.username} (\`${u.id}\`)`).join('\n');
            embed.addFields({
                name: '👥 Target Users',
                value: this.truncateText(userList, 1024),
                inline: true
            });
        }

        if (resolved.roles.length > 0) {
            const roleList = resolved.roles.map(r => `• ${r.name} (\`${r.id}\`)`).join('\n');
            embed.addFields({
                name: '🎭 Target Roles',
                value: this.truncateText(roleList, 1024),
                inline: true
            });
        }

        if (resolved.channels.length > 0) {
            const channelList = resolved.channels.map(c => `• #${c.name} (\`${c.id}\`)`).join('\n');
            embed.addFields({
                name: '📝 Target Channels',
                value: this.truncateText(channelList, 1024),
                inline: true
            });
        }

        if (resolved.categories.length > 0) {
            const catList = resolved.categories.map(c => `• ${c.name} (\`${c.id}\`)`).join('\n');
            embed.addFields({
                name: '📁 Target Categories',
                value: this.truncateText(catList, 1024),
                inline: true
            });
        }

        // Show other parameters
        if (analysis.parameters && Object.keys(analysis.parameters).length > 0) {
            const paramsText = Object.entries(analysis.parameters)
                .map(([key, value]) => `• **${key}:** ${value}`)
                .join('\n');
            embed.addFields({
                name: '⚙️ Parameters',
                value: this.truncateText(paramsText, 1024),
                inline: false
            });
        }

        // Show blocked reasons
        if (dangers.isBlocked && dangers.reasons.length > 0) {
            embed.addFields({
                name: '🚨 Blocked Reasons',
                value: dangers.reasons.join('\n'),
                inline: false
            });
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`${confirmationId}_confirm`)
                    .setLabel('Confirm')
                    .setStyle(dangers.isBlocked ? ButtonStyle.Secondary : ButtonStyle.Success)
                    .setEmoji('✅')
                    .setDisabled(dangers.isBlocked),
                new ButtonBuilder()
                    .setCustomId(`${confirmationId}_cancel`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌')
            );

        // Delete progress message and send confirmation
        await progressMsg.delete();
        const confirmMsg = await message.reply({ embeds: [embed], components: [row] });

        // Store confirmation data
        this.pendingConfirmations.set(confirmationId, {
            analysis,
            resolved,
            message,
            repliedData,
            code,
            authorId: message.author.id,
            expiresAt: Date.now() + 60000,
            blocked: dangers.isBlocked
        });

        console.log(`✅ Confirmation created: ${confirmationId}`);

        // Auto-expire after 60 seconds
        setTimeout(() => {
            if (this.pendingConfirmations.has(confirmationId)) {
                this.pendingConfirmations.delete(confirmationId);
                console.log(`⏰ Confirmation expired: ${confirmationId}`);
                embed.setTitle('⏰ Confirmation Expired').setColor(Colors.Red);
                confirmMsg.edit({ embeds: [embed], components: [] }).catch(() => { });
            }
        }, 60000);
    }

    /**
     * Helper: Split text into chunks
     */
    splitText(text, maxLength) {
        const chunks = [];
        let current = '';
        const lines = text.split('\n');

        for (const line of lines) {
            if ((current + line + '\n').length > maxLength) {
                if (current) chunks.push(current.trim());
                current = line + '\n';
            } else {
                current += line + '\n';
            }
        }

        if (current) chunks.push(current.trim());
        return chunks;
    }

    /**
     * Helper: Truncate text
     */
    truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
    }

    /**
     * Handle confirmation button clicks - OPTIMIZED FOR SPEED
     */
    async handleConfirmation(interaction, confirmed) {
        const customId = interaction.customId;
        const confirmationId = customId.replace(/_confirm$|_cancel$/, '');

        console.log(`🔘 Button clicked: ${customId}`);

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

        if (confirmData.blocked) {
            const blockedEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(Colors.Red)
                .setTitle('❌ Action Blocked');
            await interaction.update({ embeds: [blockedEmbed], components: [] });
            return;
        }

        // SPEED OPTIMIZATION: Defer the update and execute in parallel
        await interaction.deferUpdate();

        // Execute code immediately (don't wait)
        this.executeAndSendResults(confirmData, interaction, originalEmbed).catch(error => {
            console.error('💥 Background execution error:', error);
        });
    }

    /**
     * Execute code and send results (runs in background)
     */
    async executeAndSendResults(confirmData, interaction, originalEmbed) {
        try {
            console.log('⚙️ Executing code...');

            // Update to executing state
            const executingEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(Colors.Yellow)
                .setTitle('⚙️ Executing...')
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
                // Send all result embeds in parallel for speed
                const sendPromises = result.results.map(output => {
                    const outputEmbed = new EmbedBuilder()
                        .setColor(result.success ? Colors.Green : Colors.Red)
                        .setTitle(output.title || '📊 Result')
                        .setTimestamp();

                    if (output.description) {
                        outputEmbed.setDescription(output.description);
                    }

                    if (output.fields && output.fields.length > 0) {
                        const fields = output.fields.slice(0, 25);
                        outputEmbed.addFields(fields);
                    }

                    return confirmData.message.channel.send({ embeds: [outputEmbed] });
                });

                // Wait for all embeds to send
                await Promise.all(sendPromises);
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
     * Main process handler with live progress updates
     */
    async process(message, userMessage) {
        try {
            // Silent permission check
            if (!this.hasPermission(message.member, message.author.id)) {
                return { type: 'no_permission' };
            }

            // Send initial progress message
            const progressMsg = await message.reply({
                embeds: [new EmbedBuilder()
                    .setColor(Colors.Yellow)
                    .setTitle('⏳ Processing Request')
                    .setDescription('Starting...')
                    .setTimestamp()]
            });

            // Step 1: Get replied data
            const repliedData = await this.getRepliedMessageData(message);

            // Step 2: Analyze request
            const analysis = await this.analyzeRequest(message, userMessage, repliedData, progressMsg);

            // Step 3: Resolve entities
            const resolved = await this.resolveEntities(analysis, message, repliedData);

            // Step 4: Generate code
            const code = await this.generateCode(analysis, resolved, message, repliedData, progressMsg);

            // Step 5: Create confirmation (deletes progress message)
            await this.createConfirmation(message, analysis, resolved, repliedData, code, progressMsg);

            return { type: 'confirmation_created' };

        } catch (error) {
            console.error('Spectre AI processing error:', error);
            return {
                type: 'error',
                embed: new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setTitle('❌ Error')
                    .setDescription(`An error occurred: ${error.message}`)
                    .setTimestamp()
            };
        }
    }
}

module.exports = new SpectreAI();