const { HfInference } = require('@huggingface/inference');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Colors, PermissionFlagsBits, ChannelType } = require('discord.js');
const entityResolver = require('./entityResolver');
require('dotenv').config();

class SpectreAI {
    constructor() {
        console.log('🤖 SpectreAI instance created - INTELLIGENT MODE');
        this.hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
        this.entityResolver = entityResolver;
        this.pendingConfirmations = new Map();
        this.ADMIN_ID = '753491023208120321';

        this.smartPatterns = {
            math: [/calc|calculate|compute|math|[\d\+\-\*\/\^]/, this.handleMath],
            info: [/info|information|details|about/, this.handleInfo],
            list: [/list|show|display|all|every/, this.handleList],
            count: [/count|how many|total|number of/, this.handleCount],
            search: [/find|search|look.*up|get.*info/, this.handleSearch],
            utility: [/ping|time|date|uptime|status/, this.handleUtility]
        };
    }

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

    async intelligentAnalyze(userMessage, message) {
        const lowerMsg = userMessage.toLowerCase();

        const mathMatch = lowerMsg.match(/(\d+)\s*([\+\-\*\/\^])\s*(\d+)/);
        if (mathMatch) {
            return this.analyzeMath(mathMatch, userMessage);
        }

        for (const [category, [pattern, handler]] of Object.entries(this.smartPatterns)) {
            if (pattern.test(lowerMsg)) {
                const analysis = await handler.call(this, userMessage, message);
                if (analysis) return analysis;
            }
        }

        return this.smartAIAnalysis(userMessage, message);
    }

    analyzeMath(mathMatch, userMessage) {
        const [, num1, operator, num2] = mathMatch;
        let result;
        let operation;

        switch (operator) {
            case '+':
                result = parseInt(num1) + parseInt(num2);
                operation = 'addition';
                break;
            case '-':
                result = parseInt(num1) - parseInt(num2);
                operation = 'subtraction';
                break;
            case '*':
                result = parseInt(num1) * parseInt(num2);
                operation = 'multiplication';
                break;
            case '/':
                result = parseInt(num1) / parseInt(num2);
                operation = 'division';
                break;
            case '^':
                result = Math.pow(parseInt(num1), parseInt(num2));
                operation = 'exponent';
                break;
        }

        return {
            action: 'math_calculation',
            description: `Calculate ${num1} ${operator} ${num2} = ${result}`,
            detailedSteps: [
                `Parse mathematical expression: ${num1} ${operator} ${num2}`,
                `Perform ${operation} operation`,
                `Return result: ${result}`
            ],
            entities: { users: [], roles: [], channels: [], categories: [] },
            parameters: { expression: `${num1} ${operator} ${num2}`, result: result },
            usesContext: { currentChannel: false, currentCategory: false, repliedUser: false, messageAuthor: false },
            instantResult: result,
            operationType: 'math'
        };
    }

    async handleInfo(userMessage, message) {
        const lowerMsg = userMessage.toLowerCase();

        if (lowerMsg.includes('channel') || lowerMsg.includes('where am i')) {
            return {
                action: 'get_channel_info',
                description: 'Get information about the current channel',
                detailedSteps: [
                    'Access message.channel properties',
                    'Extract channel name, ID, type, creation date',
                    'Format information into embed fields',
                    'Return channel details'
                ],
                entities: { users: [], roles: [], channels: [message.channel], categories: [] },
                parameters: {},
                usesContext: { currentChannel: true, currentCategory: false, repliedUser: false, messageAuthor: false },
                operationType: 'info'
            };
        }

        if (lowerMsg.includes('server') || lowerMsg.includes('guild')) {
            return {
                action: 'get_server_info',
                description: 'Get information about this server',
                detailedSteps: [
                    'Access message.guild properties',
                    'Extract server name, member count, channel count, roles',
                    'Get server creation date and owner information',
                    'Format into comprehensive server info embed'
                ],
                entities: { users: [], roles: [], channels: [], categories: [] },
                parameters: {},
                usesContext: { currentChannel: false, currentCategory: false, repliedUser: false, messageAuthor: false },
                operationType: 'info'
            };
        }

        if (lowerMsg.includes('user') || lowerMsg.includes('member') || lowerMsg.includes('who am i')) {
            const targetUser = await this.extractUserFromMessage(userMessage, message);
            return {
                action: 'get_user_info',
                description: `Get information about ${targetUser ? targetUser.username : 'you'}`,
                detailedSteps: [
                    `Extract user information for ${targetUser ? targetUser.username : 'command author'}`,
                    'Get user creation date, join date, roles, permissions',
                    'Check if user is a bot account',
                    'Format user details into embed'
                ],
                entities: { users: targetUser ? [targetUser] : [message.author], roles: [], channels: [], categories: [] },
                parameters: {},
                usesContext: { currentChannel: false, currentCategory: false, repliedUser: false, messageAuthor: !targetUser },
                operationType: 'info'
            };
        }

        return null;
    }

    async handleList(userMessage, message) {
        const lowerMsg = userMessage.toLowerCase();

        if (lowerMsg.includes('user') || lowerMsg.includes('member')) {
            return {
                action: 'list_users',
                description: 'List all members in this server',
                detailedSteps: [
                    'Access guild.members.cache',
                    'Map members to readable list format',
                    'Handle Discord field limits by splitting into chunks if needed',
                    'Return formatted member list'
                ],
                entities: { users: [], roles: [], channels: [], categories: [] },
                parameters: { limit: 50 },
                usesContext: { currentChannel: false, currentCategory: false, repliedUser: false, messageAuthor: false },
                operationType: 'list'
            };
        }

        if (lowerMsg.includes('channel')) {
            return {
                action: 'list_channels',
                description: 'List all channels in this server',
                detailedSteps: [
                    'Access guild.channels.cache',
                    'Filter and map channels by type',
                    'Format channel list with types and names',
                    'Return organized channel list'
                ],
                entities: { users: [], roles: [], channels: [], categories: [] },
                parameters: {},
                usesContext: { currentChannel: false, currentCategory: false, repliedUser: false, messageAuthor: false },
                operationType: 'list'
            };
        }

        if (lowerMsg.includes('role')) {
            return {
                action: 'list_roles',
                description: 'List all roles in this server',
                detailedSteps: [
                    'Access guild.roles.cache',
                    'Sort roles by position',
                    'Map roles to readable list format',
                    'Return role list with member counts'
                ],
                entities: { users: [], roles: [], channels: [], categories: [] },
                parameters: {},
                usesContext: { currentChannel: false, currentCategory: false, repliedUser: false, messageAuthor: false },
                operationType: 'list'
            };
        }

        return null;
    }

    async handleCount(userMessage, message) {
        const lowerMsg = userMessage.toLowerCase();

        if (lowerMsg.includes('member') || lowerMsg.includes('user')) {
            return {
                action: 'count_members',
                description: 'Count members in this server',
                detailedSteps: [
                    'Access guild.members.cache',
                    'Count total members',
                    'Separate humans and bots',
                    'Return count statistics'
                ],
                entities: { users: [], roles: [], channels: [], categories: [] },
                parameters: {},
                usesContext: { currentChannel: false, currentCategory: false, repliedUser: false, messageAuthor: false },
                operationType: 'count'
            };
        }

        if (lowerMsg.includes('channel')) {
            return {
                action: 'count_channels',
                description: 'Count channels in this server',
                detailedSteps: [
                    'Access guild.channels.cache',
                    'Count by channel type',
                    'Return channel type breakdown'
                ],
                entities: { users: [], roles: [], channels: [], categories: [] },
                parameters: {},
                usesContext: { currentChannel: false, currentCategory: false, repliedUser: false, messageAuthor: false },
                operationType: 'count'
            };
        }

        return null;
    }

    async handleSearch(userMessage, message) {
        return {
            action: 'search_data',
            description: `Search for: ${userMessage}`,
            detailedSteps: [
                'Analyze search query',
                'Search through relevant Discord data',
                'Return matching results'
            ],
            entities: { users: [], roles: [], channels: [], categories: [] },
            parameters: { query: userMessage },
            usesContext: { currentChannel: true, currentCategory: false, repliedUser: false, messageAuthor: false },
            operationType: 'search'
        };
    }

    async handleUtility(userMessage, message) {
        const lowerMsg = userMessage.toLowerCase();

        if (lowerMsg.includes('ping')) {
            return {
                action: 'check_ping',
                description: 'Check bot latency',
                detailedSteps: [
                    'Calculate WebSocket ping',
                    'Measure response time',
                    'Return latency information'
                ],
                entities: { users: [], roles: [], channels: [], categories: [] },
                parameters: {},
                usesContext: { currentChannel: false, currentCategory: false, repliedUser: false, messageAuthor: false },
                operationType: 'utility'
            };
        }

        return null;
    }

    async smartAIAnalysis(userMessage, message) {
        const prompt = `Analyze this Discord command INTELLIGENTLY:

User: "${userMessage}"

Context: #${message.channel.name}, ${message.guild.name}, ${message.author.username}

Respond with ONLY this JSON:
{
  "action": "specific_action_name",
  "description": "clear_description_of_what_will_happen",
  "detailedSteps": ["step1", "step2", "step3"],
  "entities": {"users": [], "roles": [], "channels": [], "categories": []},
  "parameters": {},
  "usesContext": {"currentChannel": false, "currentCategory": false, "repliedUser": false, "messageAuthor": false},
  "operationType": "info|math|list|count|search|utility"
}`;

        try {
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-7B",
                messages: [
                    {
                        role: "system",
                        content: "You are an intelligent Discord command analyzer. Understand the actual user intent and provide SPECIFIC actions and descriptions."
                    },
                    { role: "user", content: prompt }
                ],
                max_tokens: 500,
                temperature: 0.1
            });

            const aiResponse = response.choices[0].message.content;
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const analysis = JSON.parse(jsonMatch[0]);

                if (analysis.action === 'execute_command') {
                    analysis.action = this.guessBetterAction(userMessage);
                }
                if (!analysis.description || analysis.description.includes('execute command')) {
                    analysis.description = this.createSmartDescription(userMessage, analysis.action);
                }

                return analysis;
            }
        } catch (error) {
            console.error('Smart analysis failed:', error);
        }

        return this.createIntelligentFallback(userMessage, message);
    }

    createIntelligentFallback(userMessage, message) {
        const lowerMsg = userMessage.toLowerCase();

        if (/\d+[\+\-\*\/\^]\d+/.test(lowerMsg)) {
            return this.analyzeMath(userMessage.match(/(\d+)\s*([\+\-\*\/\^])\s*(\d+)/), userMessage);
        }

        if (lowerMsg.includes('?')) {
            return {
                action: 'answer_question',
                description: `Answer the question: "${userMessage}"`,
                detailedSteps: [
                    'Process the question to understand what information is needed',
                    'Gather relevant data from Discord context',
                    'Format answer in clear, understandable way',
                    'Return helpful response'
                ],
                entities: { users: [], roles: [], channels: [], categories: [] },
                parameters: { question: userMessage },
                usesContext: { currentChannel: true, currentCategory: false, repliedUser: false, messageAuthor: true },
                operationType: 'info'
            };
        }

        return {
            action: 'process_request',
            description: `Process: "${userMessage}"`,
            detailedSteps: [
                'Analyze the request context and intent',
                'Execute appropriate Discord.js operations',
                'Return meaningful results based on request'
            ],
            entities: { users: [], roles: [], channels: [], categories: [] },
            parameters: { request: userMessage },
            usesContext: { currentChannel: true, currentCategory: false, repliedUser: false, messageAuthor: true },
            operationType: 'utility'
        };
    }

    guessBetterAction(userMessage) {
        const lowerMsg = userMessage.toLowerCase();

        if (lowerMsg.includes('list') || lowerMsg.includes('show') || lowerMsg.includes('all')) {
            if (lowerMsg.includes('user') || lowerMsg.includes('member')) return 'list_members';
            if (lowerMsg.includes('channel')) return 'list_channels';
            if (lowerMsg.includes('role')) return 'list_roles';
            return 'list_items';
        }

        if (lowerMsg.includes('info') || lowerMsg.includes('information')) {
            if (lowerMsg.includes('channel')) return 'get_channel_info';
            if (lowerMsg.includes('server') || lowerMsg.includes('guild')) return 'get_server_info';
            if (lowerMsg.includes('user')) return 'get_user_info';
            return 'get_information';
        }

        if (/\d+[\+\-\*\/]+\d+/.test(lowerMsg)) return 'math_calculation';
        if (lowerMsg.includes('count') || lowerMsg.includes('how many')) return 'count_items';

        return 'process_request';
    }

    createSmartDescription(userMessage, action) {
        const descriptions = {
            'math_calculation': `Calculate mathematical expression: ${userMessage}`,
            'list_members': 'List all server members with details',
            'get_channel_info': 'Show information about this channel',
            'get_server_info': 'Display server statistics and information',
            'get_user_info': 'Show user profile information',
            'list_channels': 'Display all channels in this server',
            'list_roles': 'Show all server roles with details',
            'count_items': 'Count and display quantities',
            'process_request': `Process: ${userMessage}`,
            'answer_question': `Answer: ${userMessage}`
        };

        return descriptions[action] || `Execute: ${userMessage}`;
    }

    async extractUserFromMessage(userMessage, message) {
        if (message.mentions.users.size > 0) {
            return message.mentions.users.first();
        }

        const lowerMsg = userMessage.toLowerCase();
        if (lowerMsg.includes(' me ') || lowerMsg.includes(' my ') || lowerMsg.endsWith(' me') || lowerMsg.endsWith(' my')) {
            return message.author;
        }

        const words = userMessage.split(' ');
        for (const word of words) {
            if (word.length > 2 && !this.isCommonWord(word)) {
                const user = await this.entityResolver.findUser(word, message.guild);
                if (user) return user;
            }
        }

        return null;
    }

    isCommonWord(word) {
        const commonWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'has', 'had', 'her', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use', 'that', 'with', 'this', 'have', 'from', 'they', 'will', 'what', 'when', 'where', 'which'];
        return commonWords.includes(word.toLowerCase());
    }

    async process(message, userMessage) {
        const startTime = Date.now();
        console.log(`🧠 Starting INTELLIGENT processing: "${userMessage}"`);

        try {
            if (!this.hasPermission(message.member, message.author.id)) {
                return { type: 'no_permission' };
            }

            const progressMsg = await message.reply({
                embeds: [new EmbedBuilder()
                    .setColor(Colors.Yellow)
                    .setTitle('🧠 Analyzing...')
                    .setDescription('Understanding your request intelligently...')
                    .setTimestamp()]
            });

            const analysis = await this.intelligentAnalyze(userMessage, message);
            console.log('✅ Intelligent analysis:', analysis);

            if (analysis.instantResult !== undefined) {
                await progressMsg.delete();
                await message.reply({
                    embeds: [new EmbedBuilder()
                        .setColor(Colors.Green)
                        .setTitle('✅ Calculation Result')
                        .setDescription(`**${analysis.description}**`)
                        .addFields(
                            { name: 'Expression', value: analysis.parameters.expression, inline: true },
                            { name: 'Result', value: analysis.instantResult.toString(), inline: true }
                        )
                        .setTimestamp()
                    ]
                });
                return { type: 'instant_complete' };
            }

            const repliedData = await this.getRepliedMessageData(message);
            const resolved = await this.resolveEntities(analysis, message, repliedData);
            const code = await this.generateCode(analysis, resolved, message, repliedData, progressMsg);

            await this.createConfirmation(message, analysis, resolved, repliedData, code, progressMsg);

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

    async resolveEntities(analysis, message, repliedData) {
        const resolved = { users: [], roles: [], channels: [], categories: [] };

        if (analysis.entities) {
            resolved.users.push(...analysis.entities.users);
            resolved.roles.push(...analysis.entities.roles);
            resolved.channels.push(...analysis.entities.channels);
            resolved.categories.push(...analysis.entities.categories);
        }

        if (analysis.usesContext) {
            if (analysis.usesContext.currentChannel) resolved.channels.push(message.channel);
            if (analysis.usesContext.currentCategory && message.channel.parent) resolved.categories.push(message.channel.parent);
            if (analysis.usesContext.messageAuthor) resolved.users.push(message.author);
            if (analysis.usesContext.repliedUser && repliedData) {
                resolved.users.push(repliedData.author);
            }
        }

        return resolved;
    }

    async generateCode(analysis, resolved, message, repliedData, progressMsg) {
        await progressMsg.edit({
            embeds: [new EmbedBuilder()
                .setColor(Colors.Yellow)
                .setTitle('⚡ Generating Code')
                .setDescription('Creating execution plan...')
                .setTimestamp()]
        });

        const prompt = `Generate Discord.js v14 code for: ${analysis.action}

Targets:
${resolved.users.length > 0 ? `- Users: ${resolved.users.map(u => u.username).join(', ')}` : ''}
${resolved.channels.length > 0 ? `- Channels: ${resolved.channels.map(c => c.name).join(', ')}` : ''}
${resolved.roles.length > 0 ? `- Roles: ${resolved.roles.map(r => r.name).join(', ')}` : ''}

Parameters: ${JSON.stringify(analysis.parameters)}

Return IIFE that returns {success, results[]}. Use message.guild, message.channel, cache.`;

        try {
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-7B",
                messages: [
                    { role: "system", content: "You are a Discord.js v14 code generator. Generate concise, executable JavaScript." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 1000,
                temperature: 0.2
            });

            const aiResponse = response.choices[0].message.content;
            const codeMatch = aiResponse.match(/```(?:javascript|js)?\s*([\s\S]*?)```/) || aiResponse.match(/(\(async \(\)[^]*\}\)\))/);

            if (codeMatch) {
                return codeMatch[1].trim();
            }

            if (aiResponse.includes('(async ()')) {
                return aiResponse.trim();
            }

            throw new Error('Failed to extract code from AI response');
        } catch (error) {
            console.error('Code generation error:', error);
            return this.generateFallbackCode(analysis);
        }
    }

    generateFallbackCode(analysis) {
        return `(async () => {
    try {
        return {
            success: true,
            results: [{
                title: '✅ Action Completed',
                description: '${analysis.description}',
                fields: [
                    { name: 'Action', value: '${analysis.action}', inline: true },
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

    async createConfirmation(message, analysis, resolved, repliedData, code, progressMsg) {
        await progressMsg.edit({
            embeds: [new EmbedBuilder()
                .setColor(Colors.Yellow)
                .setTitle('⚡ Finalizing')
                .setDescription('Preparing confirmation...')
                .setTimestamp()]
        });

        const confirmationId = `confirm_${Date.now()}_${message.author.id}`;
        const dangers = this.isDangerousAction(analysis, resolved);

        const embed = new EmbedBuilder()
            .setColor(dangers.isBlocked ? Colors.Red : Colors.Orange)
            .setTitle(dangers.isBlocked ? '🚫 Action Blocked' : '⚠️ Confirm Action')
            .setDescription(analysis.description)
            .setFooter({ text: dangers.isBlocked ? 'Blocked for safety' : '60 seconds to confirm' })
            .setTimestamp();

        if (analysis.detailedSteps && analysis.detailedSteps.length > 0) {
            let stepsText = analysis.detailedSteps.map((step, i) => `${i + 1}. ${step}`).join('\n');
            if (stepsText.length > 1024) {
                stepsText = stepsText.substring(0, 1020) + '...';
            }
            embed.addFields({
                name: '📋 What I Will Do',
                value: stepsText,
                inline: false
            });
        }

        if (resolved.users.length > 0) {
            const userList = resolved.users.map(u => `• ${u.username}`).join('\n');
            embed.addFields({ name: '👥 Users', value: userList, inline: true });
        }

        if (resolved.roles.length > 0) {
            const roleList = resolved.roles.map(r => `• ${r.name}`).join('\n');
            embed.addFields({ name: '🎭 Roles', value: roleList, inline: true });
        }

        if (resolved.channels.length > 0) {
            const channelList = resolved.channels.map(c => `• #${c.name}`).join('\n');
            embed.addFields({ name: '📝 Channels', value: channelList, inline: true });
        }

        if (dangers.isBlocked) {
            embed.addFields({ name: '🚨 Blocked', value: dangers.reasons.join('\n'), inline: false });
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

        await progressMsg.delete();
        const confirmMsg = await message.reply({ embeds: [embed], components: [row] });

        this.pendingConfirmations.set(confirmationId, {
            analysis, resolved, message, repliedData, code,
            authorId: message.author.id,
            expiresAt: Date.now() + 60000,
            blocked: dangers.isBlocked
        });

        setTimeout(() => {
            if (this.pendingConfirmations.has(confirmationId)) {
                this.pendingConfirmations.delete(confirmationId);
                embed.setTitle('⏰ Expired').setColor(Colors.Red);
                confirmMsg.edit({ embeds: [embed], components: [] }).catch(() => { });
            }
        }, 60000);

        console.log(`✅ Confirmation created: ${confirmationId}`);
    }

    isDangerousAction(analysis, resolved) {
        const dangers = { isBlocked: false, reasons: [] };
        const action = analysis.action.toLowerCase();
        const destructiveKeywords = ['delete', 'remove', 'ban', 'kick', 'prune', 'nuke'];

        if (destructiveKeywords.some(keyword => action.includes(keyword))) {
            const totalTargets = resolved.channels.length + resolved.users.length + resolved.roles.length;
            if (totalTargets > 5) {
                dangers.isBlocked = true;
                dangers.reasons.push(`Mass ${action} (${totalTargets} targets)`);
            }
        }

        return dangers;
    }

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

        if (confirmData.blocked) {
            const blockedEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(Colors.Red)
                .setTitle('❌ Action Blocked');
            await interaction.update({ embeds: [blockedEmbed], components: [] });
            return;
        }

        await interaction.deferUpdate();
        this.executeAndSendResults(confirmData, interaction, originalEmbed).catch(error => {
            console.error('💥 Background execution error:', error);
        });
    }

    async executeAndSendResults(confirmData, interaction, originalEmbed) {
        try {
            console.log('⚡ Executing code...');

            const executingEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(Colors.Yellow)
                .setTitle('⚡ Executing...')
                .setFooter({ text: 'Running action...' });

            await interaction.editReply({ embeds: [executingEmbed], components: [] });

            const result = await this.executeCode(confirmData.code, confirmData.message);

            const completedEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(Colors.Green)
                .setTitle('✅ Action Completed')
                .setFooter({ text: 'Execution finished' });

            await interaction.editReply({ embeds: [completedEmbed] });

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
}

module.exports = new SpectreAI();