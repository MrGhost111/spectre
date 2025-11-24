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

        const prompt = `Analyze what the user wants to do.

User Message: "${userMessage}"

Context:
${contextInfo}

${repliedData ? `Replied Message Data:
- Author: ${repliedData.author.username} (ID: ${repliedData.author.id})
- Content: ${repliedData.content}` : ''}

Examples:
- "2+2" → action: "calculate", description: "Calculate 2+2 and show result", steps: ["Parse math expression", "Calculate result", "Return answer"]
- "ban @user" → action: "ban_user", description: "Ban user from server", steps: ["Verify permissions", "Ban user", "Log action"]
- "list users" → action: "list_users", description: "Show all server members", steps: ["Fetch members", "Format list", "Display results"]

Respond ONLY with this JSON (no markdown, no explanation):
{
  "action": "what_to_do",
  "description": "Clear one-line explanation",
  "detailedSteps": [
    "First thing bot will do",
    "Second thing bot will do",
    "Third thing bot will do"
  ],
  "entities": {
    "users": [],
    "roles": [],
    "channels": [],
    "categories": []
  },
  "parameters": {},
  "usesContext": {
    "currentChannel": false,
    "currentCategory": false,
    "repliedUser": false,
    "messageAuthor": false
  }
}`;

        try {
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    {
                        role: "system",
                        content: "You analyze Discord bot requests. Return ONLY JSON, no markdown, no code blocks."
                    },
                    { role: "user", content: prompt }
                ],
                max_tokens: 600,
                temperature: 0.05
            });

            const aiResponse = response.choices[0].message.content;
            console.log('🔍 AI Response:', aiResponse.substring(0, 200));

            let analysis = this.extractJSONFromText(aiResponse);

            if (!analysis) {
                throw new Error('Could not extract valid analysis from AI response');
            }

            // Ensure all required fields exist
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
            throw new Error('Failed to analyze request: ' + error.message);
        }
    }

    extractJSONFromText(text) {
        console.log('🔍 Extracting JSON from text...');

        // Method 1: Try direct parse first
        try {
            const parsed = JSON.parse(text);
            console.log('✅ Direct parse successful');
            return parsed;
        } catch (e) {
            console.log('❌ Direct parse failed, trying extraction methods...');
        }

        // Method 2: Remove markdown code blocks
        let cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();
        try {
            const parsed = JSON.parse(cleaned);
            console.log('✅ Parsed after removing code blocks');
            return parsed;
        } catch (e) {
            // Continue
        }

        // Method 3: Find JSON object with regex
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                console.log('✅ Extracted JSON with regex');
                return parsed;
            } catch (e) {
                console.log('❌ Regex extraction failed');
            }
        }

        // Method 4: Try to fix common JSON formatting issues
        try {
            cleaned = text
                .replace(/```json|```/g, '')
                .replace(/^[^{]*/, '')
                .replace(/[^}]*$/, '')
                .replace(/,(\s*[}\]])/g, '$1')
                .trim();

            const parsed = JSON.parse(cleaned);
            console.log('✅ Parsed after aggressive cleanup');
            return parsed;
        } catch (e) {
            console.log('❌ All JSON extraction methods failed');
        }

        // Method 5: Last resort fallback
        console.warn('⚠️ Using fallback JSON structure');
        return {
            action: 'process_request',
            description: text.substring(0, 200),
            detailedSteps: [
                'Parse user request',
                'Execute requested operation',
                'Return results to user'
            ],
            entities: { users: [], roles: [], channels: [], categories: [] },
            parameters: {},
            usesContext: {
                currentChannel: false,
                currentCategory: false,
                repliedUser: false,
                messageAuthor: false
            }
        };
    }

    async generateCode(analysis, resolved, message, repliedData, progressMsg) {
        await progressMsg.edit({
            embeds: [new EmbedBuilder()
                .setColor(Colors.Yellow)
                .setTitle('⏳ Step 2/3: Generating Code')
                .setDescription('Creating execution plan...')
                .setTimestamp()]
        });

        const prompt = `Generate Discord.js v14 code for this action.

ACTION: ${analysis.action}
DESCRIPTION: ${analysis.description}

ENTITIES:
Users: ${resolved.users.map(u => `${u.username} (${u.id})`).join(', ') || 'none'}
Roles: ${resolved.roles.map(r => `${r.name} (${r.id})`).join(', ') || 'none'}
Channels: ${resolved.channels.map(c => `${c.name} (${c.id})`).join(', ') || 'none'}

PARAMETERS: ${JSON.stringify(analysis.parameters)}

AVAILABLE VARIABLES:
- message (the Discord message object)
- guild (message.guild)
- channel (message.channel)
- client (message.client)
- PermissionFlagsBits, ChannelType, EmbedBuilder, Colors (all imported)

RULES:
1. Use Discord.js v14 syntax ONLY
2. Return format: { success: true/false, results: [{title: "Title", description: "Text"}] }
3. Keep descriptions under 4096 chars
4. Handle all errors with try-catch
5. Return the code as an IIFE: (async () => { your code here })()

EXAMPLES:

For "2+2":
(async () => {
  try {
    const result = 2 + 2;
    return {
      success: true,
      results: [{
        title: '🧮 Calculation Result',
        description: \`2 + 2 = \${result}\`
      }]
    };
  } catch (error) {
    return { success: false, results: [{title: 'Error', description: error.message}] };
  }
})()

For "list users":
(async () => {
  try {
    const members = await guild.members.fetch();
    const userList = members.map(m => \`• \${m.user.username}\`).slice(0, 50).join('\\n');
    return {
      success: true,
      results: [{
        title: '👥 Server Members',
        description: userList || 'No members found'
      }]
    };
  } catch (error) {
    return { success: false, results: [{title: 'Error', description: error.message}] };
  }
})()

Now generate code for the action described above. Return ONLY the IIFE code, nothing else:`;

        try {
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    {
                        role: "system",
                        content: "You are an expert Discord.js v14 code generator. Generate ONLY executable JavaScript code as an IIFE. No explanations, no markdown, just code."
                    },
                    { role: "user", content: prompt }
                ],
                max_tokens: 2000,
                temperature: 0.1
            });

            const aiResponse = response.choices[0].message.content;
            console.log('🤖 AI Code Response:', aiResponse.substring(0, 300));

            let code = this.extractCodeFromResponse(aiResponse);

            if (!code) {
                console.error('❌ Failed to extract code, using fallback');
                code = `(async () => {
                        return {
                            success: true,
                            results: [{
                                title: '✅ Action Processed',
                                description: '${analysis.description.replace(/'/g, "\\'")}\\n\\nAction: ${analysis.action}'
                            }]
                        };
                    })()`;
            }

            // Clean up the code
            code = code.trim();

            // Validate code syntax
            try {
                new Function(`return ${code}`);
                console.log('✅ Code syntax validated');
                return code;
            } catch (error) {
                console.error('❌ Code validation failed:', error.message);
                console.error('Problematic code:', code.substring(0, 500));

                // Return safe fallback code
                return `(async () => {
                        return {
                            success: true,
                            results: [{
                                title: '⚠️ Simplified Execution',
                                description: 'Action: ${analysis.action}\\n\\n${analysis.description.replace(/'/g, "\\'")}'
                            }]
                        };
                    })()`;
            }

        } catch (error) {
            console.error('Code generation error:', error);
            throw new Error('Failed to generate code: ' + error.message);
        }
    }

    extractCodeFromResponse(text) {
        console.log('🔍 Extracting code from response...');

        // Method 1: Code blocks
        const codeBlockMatch = text.match(/```(?:javascript|js)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
            const code = codeBlockMatch[1].trim();
            console.log('✅ Found code in block');
            return this.wrapCodeIfNeeded(code);
        }

        // Method 2: IIFE pattern
        const iifeMatch = text.match(/(\(async\s*\(\)\s*\{[\s\S]*?\}\)\(\));?/);
        if (iifeMatch) {
            console.log('✅ Found IIFE pattern');
            return iifeMatch[1].trim();
        }

        // Method 3: Arrow function pattern
        const arrowMatch = text.match(/(async\s*\(\)\s*=>\s*\{[\s\S]*?\})/);
        if (arrowMatch) {
            console.log('✅ Found arrow function');
            return `(${arrowMatch[1].trim()})()`;
        }

        // Method 4: Look for return statement with object
        const returnMatch = text.match(/return\s*(\{[\s\S]*?\});?\s*$/m);
        if (returnMatch) {
            console.log('✅ Found return statement');
            return `(async () => { return ${returnMatch[1]}; })()`;
        }

        // Method 5: Wrap entire text if it looks like code
        if (text.includes('async') || text.includes('await') || text.includes('message.') || text.includes('guild.')) {
            console.log('⚠️ Wrapping raw code');
            return this.wrapCodeIfNeeded(text);
        }

        console.error('❌ Could not extract code');
        return null;
    }

    wrapCodeIfNeeded(code) {
        // Remove any leading/trailing junk
        code = code.trim();

        // If it's already an IIFE, return it
        if (code.startsWith('(async') && code.includes(')()')) {
            return code;
        }

        // If it starts with const/let/var or has statements, wrap it properly
        if (code.startsWith('const ') || code.startsWith('let ') || code.startsWith('var ') ||
            code.includes('\n') || !code.startsWith('return')) {
            return `(async () => {\n${code}\n})()`;
        }

        // If it's just a return statement, wrap it
        if (code.startsWith('return')) {
            return `(async () => { ${code} })()`;
        }

        // Otherwise wrap it as an expression
        return `(async () => { return ${code} })()`;
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