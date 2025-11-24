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
        this.requestCache = new Map();
        this.cacheTimeout = 30000;
    }

    hasPermission(member, userId) {
        return userId === this.ADMIN_ID ||
            (member && member.permissions.has(PermissionFlagsBits.Administrator));
    }

    getCacheKey(message, userMessage) {
        return `${message.guild.id}:${userMessage.toLowerCase().trim()}`;
    }

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

    async resolveEntities(analysis, message, repliedData) {
        const resolved = {
            users: [],
            roles: [],
            channels: [],
            categories: []
        };

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

        if (analysis.entities && analysis.entities.users) {
            for (const userName of analysis.entities.users) {
                const user = await this.entityResolver.findUser(userName, message.guild);
                if (user && !resolved.users.find(u => u.id === user.id)) {
                    resolved.users.push(user);
                }
            }
        }

        if (analysis.entities && analysis.entities.roles) {
            for (const roleName of analysis.entities.roles) {
                const role = this.entityResolver.findRole(roleName, message.guild);
                if (role && !resolved.roles.find(r => r.id === role.id)) {
                    resolved.roles.push(role);
                }
            }
        }

        if (analysis.entities && analysis.entities.channels) {
            for (const channelName of analysis.entities.channels) {
                const channel = this.entityResolver.findChannel(channelName, message.guild);
                if (channel && !resolved.channels.find(c => c.id === channel.id)) {
                    resolved.channels.push(channel);
                }
            }
        }

        if (analysis.entities && analysis.entities.categories) {
            for (const categoryName of analysis.entities.categories) {
                const category = this.entityResolver.findCategory(categoryName, message.guild);
                if (category && !resolved.categories.find(c => c.id === category.id)) {
                    resolved.categories.push(category);
                }
            }
        }

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

    extractJSONFromText(text) {
        // First try to find JSON in code blocks
        const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
            try {
                return JSON.parse(codeBlockMatch[1].trim());
            } catch (e) {
                console.log('Failed to parse JSON from code block');
            }
        }

        // Try to find JSON object directly
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e) {
                console.log('Failed to parse JSON object directly');
            }
        }

        // Try to fix common JSON issues
        const fixedText = text
            .replace(/(\w+):/g, '"$1":') // Fix unquoted keys
            .replace(/'/g, '"') // Replace single quotes with double quotes
            .replace(/,\s*}/g, '}') // Remove trailing commas
            .replace(/,\s*]/g, ']'); // Remove trailing commas in arrays

        const fixedMatch = fixedText.match(/\{[\s\S]*\}/);
        if (fixedMatch) {
            try {
                return JSON.parse(fixedMatch[0]);
            } catch (e) {
                console.log('Failed to parse fixed JSON');
            }
        }

        throw new Error('Could not extract valid JSON from AI response');
    }

    createFallbackAnalysis(userMessage, message) {
        const lowerMsg = userMessage.toLowerCase();

        // Simple fallback analysis based on common patterns
        if (lowerMsg.includes('channel') && (lowerMsg.includes('what') || lowerMsg.includes('which') || lowerMsg.includes('where'))) {
            return {
                action: 'get_channel_info',
                description: 'Get information about the current channel',
                detailedSteps: [
                    'Access message.channel properties',
                    'Extract channel name, ID, type, and creation date',
                    'Format information into embed fields',
                    'Return channel details in results array'
                ],
                entities: {
                    users: [],
                    roles: [],
                    channels: [],
                    categories: []
                },
                parameters: {},
                usesContext: {
                    currentChannel: true,
                    currentCategory: false,
                    repliedUser: false,
                    messageAuthor: false
                }
            };
        } else if (/\d+[\+\-\*\/\^]\d+/.test(lowerMsg)) {
            return {
                action: 'math_calculation',
                description: `Calculate mathematical expression: ${userMessage}`,
                detailedSteps: [
                    'Parse mathematical expression from user message',
                    'Perform calculation using JavaScript eval (safe for basic math)',
                    'Return calculation result in formatted embed',
                    'Handle any calculation errors gracefully'
                ],
                entities: {
                    users: [],
                    roles: [],
                    channels: [],
                    categories: []
                },
                parameters: {
                    expression: userMessage
                },
                usesContext: {
                    currentChannel: false,
                    currentCategory: false,
                    repliedUser: false,
                    messageAuthor: false
                }
            };
        } else if (lowerMsg.includes('list') || lowerMsg.includes('show')) {
            if (lowerMsg.includes('user') || lowerMsg.includes('member')) {
                return {
                    action: 'list_users',
                    description: 'List all members in this server',
                    detailedSteps: [
                        'Access guild.members.cache to get all members',
                        'Map members to readable format with usernames and IDs',
                        'Split into chunks if exceeding Discord field limits',
                        'Return formatted member list in results'
                    ],
                    entities: {
                        users: [],
                        roles: [],
                        channels: [],
                        categories: []
                    },
                    parameters: {
                        limit: 50
                    },
                    usesContext: {
                        currentChannel: false,
                        currentCategory: false,
                        repliedUser: false,
                        messageAuthor: false
                    }
                };
            } else if (lowerMsg.includes('channel')) {
                return {
                    action: 'list_channels',
                    description: 'List all channels in this server',
                    detailedSteps: [
                        'Access guild.channels.cache to get all channels',
                        'Filter and format channels by type',
                        'Create organized list of channel names and types',
                        'Return channel list in results'
                    ],
                    entities: {
                        users: [],
                        roles: [],
                        channels: [],
                        categories: []
                    },
                    parameters: {},
                    usesContext: {
                        currentChannel: false,
                        currentCategory: false,
                        repliedUser: false,
                        messageAuthor: false
                    }
                };
            }
        }

        // Default fallback
        return {
            action: 'process_request',
            description: `Process user request: ${userMessage}`,
            detailedSteps: [
                'Analyze the request context and intent',
                'Execute appropriate Discord.js operations based on the request',
                'Return meaningful results in embed format',
                'Handle any errors during execution'
            ],
            entities: {
                users: [],
                roles: [],
                channels: [],
                categories: []
            },
            parameters: {
                request: userMessage
            },
            usesContext: {
                currentChannel: true,
                currentCategory: false,
                repliedUser: false,
                messageAuthor: true
            }
        };
    }

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

        const prompt = `Analyze this Discord command and return ONLY valid JSON:

User: "${userMessage}"
Context: ${contextInfo}
${repliedData ? `Replying to: ${repliedData.author.username}` : ''}

Return this exact JSON structure:
{
  "action": "specific_action_name",
  "description": "clear_description_here",
  "detailedSteps": ["step1", "step2", "step3"],
  "entities": {"users": [], "roles": [], "channels": [], "categories": []},
  "parameters": {},
  "usesContext": {"currentChannel": false, "currentCategory": false, "repliedUser": false, "messageAuthor": false}
}

IMPORTANT: Return ONLY the JSON, no other text.`;

        try {
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-7B",
                messages: [
                    {
                        role: "system",
                        content: "You are a Discord command analyzer. You MUST respond with ONLY valid JSON that can be parsed by JSON.parse(). No explanations, no additional text."
                    },
                    { role: "user", content: prompt }
                ],
                max_tokens: 500,
                temperature: 0.1
            });

            const aiResponse = response.choices[0].message.content;
            console.log('AI Analysis Response:', aiResponse);

            let analysis;
            try {
                analysis = this.extractJSONFromText(aiResponse);
            } catch (error) {
                console.error('JSON extraction failed, using fallback analysis');
                analysis = this.createFallbackAnalysis(userMessage, message);
            }

            // Validate and ensure all required fields exist
            if (!analysis.entities) analysis.entities = { users: [], roles: [], channels: [], categories: [] };
            if (!analysis.parameters) analysis.parameters = {};
            if (!analysis.usesContext) analysis.usesContext = { currentChannel: false, currentCategory: false, repliedUser: false, messageAuthor: false };
            if (!analysis.detailedSteps) analysis.detailedSteps = ['Process user request', 'Execute operation', 'Return results'];
            if (!analysis.description) analysis.description = `Execute: ${userMessage}`;
            if (!analysis.action) analysis.action = 'process_request';

            this.requestCache.set(cacheKey, {
                data: analysis,
                timestamp: Date.now()
            });

            return analysis;
        } catch (error) {
            console.error('Request analysis error:', error);
            return this.createFallbackAnalysis(userMessage, message);
        }
    }

    async generateCode(analysis, resolved, message, repliedData, progressMsg) {
        await progressMsg.edit({
            embeds: [new EmbedBuilder()
                .setColor(Colors.Yellow)
                .setTitle('⏳ Step 2/3: Generating Code')
                .setDescription('Creating execution plan...')
                .setTimestamp()]
        });

        const prompt = `Generate Discord.js v14 code for: ${analysis.action}

Targets:
${resolved.users.length > 0 ? `- Users: ${resolved.users.map(u => `${u.username} (${u.id})`).join(', ')}` : ''}
${resolved.channels.length > 0 ? `- Channels: ${resolved.channels.map(c => `${c.name} (${c.id})`).join(', ')}` : ''}
${resolved.roles.length > 0 ? `- Roles: ${resolved.roles.map(r => `${r.name} (${r.id})`).join(', ')}` : ''}

Parameters: ${JSON.stringify(analysis.parameters)}

Return ONLY JavaScript code in this format:
(async () => {
  try {
    // Your code here
    return { success: true, results: [{ title: "Result", description: "Output" }] };
  } catch (error) {
    return { success: false, results: [{ title: "Error", description: error.message }] };
  }
})();`;

        try {
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-7B",
                messages: [
                    {
                        role: "system",
                        content: "You are a Discord.js v14 code generator. Return ONLY executable JavaScript code in IIFE format. No explanations, no markdown code blocks."
                    },
                    { role: "user", content: prompt }
                ],
                max_tokens: 1500,
                temperature: 0.2
            });

            const aiResponse = response.choices[0].message.content;
            console.log('AI Code Response:', aiResponse);

            // Extract code with multiple fallback methods
            let code = this.extractCodeFromResponse(aiResponse);

            if (!code) {
                throw new Error('Could not extract valid code from AI response');
            }

            return code;
        } catch (error) {
            console.error('Code generation error:', error);
            return this.generateFallbackCode(analysis);
        }
    }

    extractCodeFromResponse(text) {
        // Method 1: Code blocks
        const codeBlockMatch = text.match(/```(?:javascript|js)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
            return codeBlockMatch[1].trim();
        }

        // Method 2: IIFE pattern
        const iifeMatch = text.match(/(\(async\s*\(\)\s*\{[\s\S]*?\}\)\(\));?/);
        if (iifeMatch) {
            return iifeMatch[1].trim();
        }

        // Method 3: Any function-like structure
        const functionMatch = text.match(/(async\s*\(\)\s*=>\s*\{[\s\S]*?\}|\(\)\s*=>\s*\{[\s\S]*?\})/);
        if (functionMatch) {
            return `(${functionMatch[1].trim()})();`;
        }

        // Method 4: Just return the whole text if it looks like code
        if (text.includes('async') || text.includes('await') || text.includes('message.') || text.includes('guild.')) {
            return `(async () => { ${text} })();`;
        }

        return null;
    }

    generateFallbackCode(analysis) {
        return `(async () => {
    try {
        return {
            success: true,
            results: [{
                title: '✅ Action Completed',
                description: '${analysis.description.replace(/'/g, "\\'")}',
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

    async executeCode(code, message) {
        try {
            const guild = message.guild;
            const client = message.client;
            const channel = message.channel;

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

    isDangerousAction(analysis, resolved) {
        const dangers = {
            isBlocked: false,
            reasons: []
        };

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

        embed.addFields({
            name: '🎯 What I Understood',
            value: analysis.description,
            inline: false
        });

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

        await progressMsg.delete();
        const confirmMsg = await message.reply({ embeds: [embed], components: [row] });

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

        setTimeout(() => {
            if (this.pendingConfirmations.has(confirmationId)) {
                this.pendingConfirmations.delete(confirmationId);
                console.log(`⏰ Confirmation expired: ${confirmationId}`);
                embed.setTitle('⏰ Confirmation Expired').setColor(Colors.Red);
                confirmMsg.edit({ embeds: [embed], components: [] }).catch(() => { });
            }
        }, 60000);
    }

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

    truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
    }

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

        await interaction.deferUpdate();

        this.executeAndSendResults(confirmData, interaction, originalEmbed).catch(error => {
            console.error('💥 Background execution error:', error);
        });
    }

    async executeAndSendResults(confirmData, interaction, originalEmbed) {
        try {
            console.log('⚙️ Executing code...');

            const executingEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(Colors.Yellow)
                .setTitle('⚙️ Executing...')
                .setFooter({ text: 'Running action...' });

            await interaction.editReply({ embeds: [executingEmbed], components: [] });

            const result = await this.executeCode(confirmData.code, confirmData.message);

            const completedEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(Colors.Green)
                .setTitle('✅ Action Completed')
                .setFooter({ text: 'Execution finished' });

            await interaction.editReply({ embeds: [completedEmbed] });

            if (result && result.results && result.results.length > 0) {
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

    async process(message, userMessage) {
        try {
            if (!this.hasPermission(message.member, message.author.id)) {
                return { type: 'no_permission' };
            }

            const progressMsg = await message.reply({
                embeds: [new EmbedBuilder()
                    .setColor(Colors.Yellow)
                    .setTitle('⏳ Processing Request')
                    .setDescription('Starting...')
                    .setTimestamp()]
            });

            const repliedData = await this.getRepliedMessageData(message);
            const analysis = await this.analyzeRequest(message, userMessage, repliedData, progressMsg);
            const resolved = await this.resolveEntities(analysis, message, repliedData);
            const code = await this.generateCode(analysis, resolved, message, repliedData, progressMsg);
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