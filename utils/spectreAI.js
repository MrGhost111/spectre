const { GoogleGenerativeAI } = require('@google/generative-ai');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Colors } = require('discord.js');
const entityResolver = require('./entityResolver');
require('dotenv').config();

class SpectreAI {
    constructor() {
        const apiKey = process.env.GEMINI_KEY;
        if (!apiKey) {
            console.error('❌ [SpectreAI] GEMINI_KEY is missing in .env');
            return;
        }

        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        this.entityResolver = entityResolver;
        this.pendingConfirmations = new Map();

        // SECURITY: Your Discord User ID - ONLY YOU can use this bot
        this.AUTHORIZED_USER_ID = '753491023208120321';

        console.log('🚀 SpectreAI: System ready. Integration mode active.');
    }

    /**
     * Helper: call Gemini with a system instruction + user prompt, returns text
     */
    async callGemini(systemInstruction, userPrompt, maxOutputTokens = 1000, temperature = 0.1) {
        const model = this.genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction,
            generationConfig: { maxOutputTokens, temperature }
        });
        const result = await model.generateContent(userPrompt);
        return result.response.text();
    }

    /**
     * SECURITY: Check if user has permission to execute actions
     */
    hasPermission(member, userId) {
        return userId === this.AUTHORIZED_USER_ID;
    }

    /**
     * Get replied message data if exists
     */
    async getRepliedMessageData(message) {
        if (!message.reference) return null;

        try {
            const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);

            const data = {
                author: repliedMsg.author,
                content: repliedMsg.content || '',
                embeds: [],
                attachments: []
            };

            if (repliedMsg.embeds.length > 0) {
                repliedMsg.embeds.forEach(embed => {
                    data.embeds.push({
                        title: embed.title || '',
                        description: embed.description || '',
                        fields: embed.fields.map(f => ({ name: f.name, value: f.value })),
                        url: embed.url || '',
                        timestamp: embed.timestamp || ''
                    });
                });
            }

            if (repliedMsg.attachments.size > 0) {
                repliedMsg.attachments.forEach(att => {
                    data.attachments.push({ name: att.name, url: att.url, type: att.contentType });
                });
            }

            return data;
        } catch (error) {
            console.error('Failed to fetch replied message:', error);
            return null;
        }
    }

    /**
     * Analyze if action is dangerous/spam
     */
    isDangerousAction(analysis) {
        const dangers = {
            isSpam: false,
            isNuke: false,
            isMassPing: false,
            isDangerous: false,
            reasons: []
        };

        if (analysis.parameters) {
            const messageCount = parseInt(analysis.parameters.count) ||
                parseInt(analysis.parameters.amount) ||
                parseInt(analysis.parameters.messages) || 0;

            if (messageCount > 20) {
                dangers.isSpam = true;
                dangers.reasons.push(`⚠️ High message count: ${messageCount} messages (consider using lower count)`);
            }
        }

        const action = analysis.action.toLowerCase();
        const destructiveKeywords = ['delete', 'remove', 'ban', 'kick', 'purge', 'clear'];

        if (destructiveKeywords.some(keyword => action.includes(keyword))) {
            const totalTargets = (analysis.entities.channels?.length || 0) +
                (analysis.entities.users?.length || 0) +
                (analysis.entities.roles?.length || 0);

            if (totalTargets > 5) {
                dangers.isNuke = true;
                dangers.isDangerous = true;
                dangers.reasons.push(`🚨 Mass ${action} detected (${totalTargets} targets) - Please be careful`);
            }
        }

        if (action.includes('ping') || action.includes('mention') || action.includes('dm')) {
            const pingCount = (analysis.entities.users?.length || 0) +
                (analysis.entities.roles?.length || 0);

            if (pingCount > 3) {
                dangers.isMassPing = true;
                dangers.reasons.push(`📢 Mass ping/DM detected (${pingCount} targets) - Consider if this is necessary`);
            }
        }

        if (analysis.parameters) {
            const paramsStr = JSON.stringify(analysis.parameters).toLowerCase();
            if (paramsStr.includes('@everyone') || paramsStr.includes('@here')) {
                dangers.isMassPing = true;
                dangers.reasons.push('📢 Warning: Contains @everyone or @here mention');
            }
        }

        return dangers;
    }

    /**
     * Build detailed context information
     */
    async buildContextInfo(message) {
        let context = `- Current Channel: #${message.channel.name} (ID: ${message.channel.id})`;
        context += `\n- Message Author: ${message.author.username} (ID: ${message.author.id})`;
        context += `\n- Guild: ${message.guild.name} (ID: ${message.guild.id})`;

        if (message.channel.parent) {
            context += `\n- Current Category: ${message.channel.parent.name} (ID: ${message.channel.parent.id})`;
        }

        if (message.reference) {
            context += `\n- Is replying to a message: YES`;
        }

        const member = message.guild.members.cache.get(message.author.id);
        if (member) {
            const roles = member.roles.cache
                .filter(r => r.id !== message.guild.id)
                .map(r => r.name)
                .join(', ');
            context += `\n- Author Roles: ${roles || 'None'}`;
        }

        return context;
    }

    /**
     * Enhanced request analysis
     */
    async analyzeRequest(message, userMessage) {
        const contextInfo = await this.buildContextInfo(message);
        const repliedData = await this.getRepliedMessageData(message);

        const prompt = `You are a Discord action analyzer. Analyze what the user wants to do with extreme precision and extract all relevant information.

User Message: "${userMessage}"

Context:
${contextInfo}

${repliedData ? `Replied Message Data:
- Author: ${repliedData.author.username} (ID: ${repliedData.author.id})
- Content: ${repliedData.content}
- Embeds: ${JSON.stringify(repliedData.embeds)}
- Attachments: ${repliedData.attachments.length} file(s)` : ''}

CRITICAL CONTEXT INTERPRETATION RULES:
- "this channel" / "here" / "this" (without other context) = current channel (${message.channel.name})
- "this category" = current category (${message.channel.parent?.name || 'none'})
- "this user" (when replying) = the user being replied to
- "this message" / "this" (when replying) = the message being replied to
- "me" / "my" / "myself" = the command author (${message.author.username})
- "last X messages" / "previous messages" = fetch message history
- "everyone" / "all users" = all server members (be very careful with this)
- "delete messages" = bulk delete operation
- "summarize" / "summary" = analyze and condense information
- "list" / "show" / "display" = retrieve and display information
- "give me" / "add" (with role) = assign role to command author
- "create" = make new entity (role, channel, etc.)

CRITICAL: When user asks to "summarize", "analyze", "understand", or "read" messages:
- This requires AI comprehension, not just data fetching
- Include "analyze" or "comprehend" in the action name
- Set parameters to indicate AI processing is needed

Respond with ONLY valid JSON (no markdown, no explanations):
{
  "action": "action_name_here",
  "description": "Clear human-readable description of what will happen",
  "detailedSteps": [
    "Step 1: ...",
    "Step 2: ..."
  ],
  "entities": {
    "users": ["username1"],
    "roles": ["rolename1"],
    "channels": ["channelname1"],
    "categories": ["categoryname1"]
  },
  "parameters": {
    "count": 10,
    "reason": "value",
    "name": "value",
    "content": "message text"
  },
  "usesContext": {
    "currentChannel": true,
    "currentCategory": false,
    "repliedUser": false,
    "repliedMessage": false,
    "messageAuthor": true
  }
}`;

        try {
            const aiResponse = await this.callGemini(
                'You are a Discord action analyzer. Respond only with valid JSON. Be extremely precise and consider all context clues.',
                prompt,
                1000,
                0.1
            );

            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('Failed to parse AI response - no JSON found');

            const analysis = JSON.parse(jsonMatch[0]);
            if (!analysis.action || !analysis.description || !analysis.detailedSteps) {
                throw new Error('Incomplete analysis from AI');
            }

            const resolved = await this.resolveEntities(analysis, message, repliedData);
            return { analysis, resolved, repliedData };
        } catch (error) {
            console.error('Request analysis error:', error);
            throw error;
        }
    }

    /**
     * Enhanced entity resolution
     */
    async resolveEntities(analysis, message, repliedData) {
        const resolved = { users: [], roles: [], channels: [], categories: [] };

        if (analysis.usesContext) {
            if (analysis.usesContext.currentChannel) resolved.channels.push(message.channel);
            if (analysis.usesContext.currentCategory && message.channel.parent) resolved.categories.push(message.channel.parent);
            if (analysis.usesContext.messageAuthor) resolved.users.push(message.author);
            if (analysis.usesContext.repliedUser && repliedData) {
                if (!resolved.users.find(u => u.id === repliedData.author.id)) resolved.users.push(repliedData.author);
            }
        }

        if (analysis.entities.users) {
            for (const userName of analysis.entities.users) {
                const user = await this.entityResolver.findUser(userName, message.guild);
                if (user && !resolved.users.find(u => u.id === user.id)) resolved.users.push(user);
            }
        }

        if (analysis.entities.roles) {
            for (const roleName of analysis.entities.roles) {
                const role = this.entityResolver.findRole(roleName, message.guild);
                if (role && !resolved.roles.find(r => r.id === role.id)) resolved.roles.push(role);
            }
        }

        if (analysis.entities.channels) {
            for (const channelName of analysis.entities.channels) {
                const channel = this.entityResolver.findChannel(channelName, message.guild);
                if (channel && !resolved.channels.find(c => c.id === channel.id)) resolved.channels.push(channel);
            }
        }

        if (analysis.entities.categories) {
            for (const categoryName of analysis.entities.categories) {
                const category = this.entityResolver.findCategory(categoryName, message.guild);
                if (category && !resolved.categories.find(c => c.id === category.id)) resolved.categories.push(category);
            }
        }

        if (message.mentions.users.size > 0) {
            message.mentions.users.forEach(user => {
                if (!resolved.users.find(u => u.id === user.id)) resolved.users.push(user);
            });
        }

        if (message.mentions.roles.size > 0) {
            message.mentions.roles.forEach(role => {
                if (!resolved.roles.find(r => r.id === role.id)) resolved.roles.push(role);
            });
        }

        if (message.mentions.channels.size > 0) {
            message.mentions.channels.forEach(channel => {
                if (!resolved.channels.find(c => c.id === channel.id)) resolved.channels.push(channel);
            });
        }

        return resolved;
    }

    /**
     * Code generation using Gemini
     */
    async generateCode(analysis, resolved, message, repliedData) {
        const resolvedUserIds = resolved.users.map(u => u.id);
        const resolvedRoleIds = resolved.roles.map(r => r.id);
        const resolvedChannelIds = resolved.channels.map(c => c.id);
        const resolvedCategoryIds = resolved.categories.map(c => c.id);

        const prompt = `Generate Discord.js v14 code to perform this action with maximum precision.

Action: ${analysis.action}
Description: ${analysis.description}
Steps: ${JSON.stringify(analysis.detailedSteps)}

RESOLVED ENTITY IDs (use these EXACT IDs):
- User IDs: [${resolvedUserIds.join(', ')}]
- Role IDs: [${resolvedRoleIds.join(', ')}]
- Channel IDs: [${resolvedChannelIds.join(', ')}]
- Category IDs: [${resolvedCategoryIds.join(', ')}]

Parameters: ${JSON.stringify(analysis.parameters)}

${repliedData ? `Replied Message Data:
- Author ID: ${repliedData.author.id}
- Content: ${repliedData.content}
- Embeds: ${JSON.stringify(repliedData.embeds)}` : ''}

AVAILABLE VARIABLES (pre-defined, DO NOT redeclare):
- message: Discord message object
- guild: Guild object (message.guild)
- client: Discord client
- channel: Current channel (message.channel)
- PermissionFlagsBits, ChannelType, EmbedBuilder, Colors
- geminiClient: GoogleGenerativeAI instance — use for AI analysis tasks

DISCORD.JS V14 CRITICAL RULES:
1. Fetch members: await guild.members.fetch(userId) or guild.members.cache.get(userId)
2. Fetch channels: guild.channels.cache.get(channelId)
3. Fetch roles: guild.roles.cache.get(roleId)
4. Fetch messages: await channel.messages.fetch({ limit: number })
5. Send messages: await channel.send({ content: 'text' }) or { embeds: [embed] }
6. Bulk delete: await channel.bulkDelete(messages, true)
7. Member permissions: member.permissions.has(PermissionFlagsBits.Administrator)
8. Role operations: await member.roles.add(role) or await member.roles.remove(role)
9. NEVER use deprecated methods: .isText(), .isTextBased(), .isThread()
10. Check channel type: channel.type === ChannelType.GuildText

AI ANALYSIS — HOW TO USE geminiClient:
When the action involves summarizing, analyzing, or comprehending content, use geminiClient like this:

const aiModel = geminiClient.getGenerativeModel({ model: 'gemini-2.5-flash' });
const aiResult = await aiModel.generateContent(yourPromptString);
const aiText = aiResult.response.text();

SUMMARIZATION EXAMPLE:
const fetchedMsgs = await channel.messages.fetch({ limit: 101 });
const sortedMsgs = Array.from(fetchedMsgs.values())
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .filter(m => m.id !== message.id)
    .slice(-100);

const conversation = sortedMsgs
    .filter(m => !m.author.bot && m.content.trim().length > 0)
    .map((m, idx) => {
        const time = new Date(m.createdTimestamp).toLocaleTimeString();
        return \`[\${time}] [\${m.author.username}]: \${m.content}\`;
    })
    .join('\\n');

const aiModel = geminiClient.getGenerativeModel({ model: 'gemini-2.5-flash' });
const aiResult = await aiModel.generateContent(
    'Summarize this Discord conversation. Identify key topics and each user\\'s contributions:\\n\\n' + conversation
);
const summary = aiResult.response.text();

REQUIRED RETURN FORMAT — always return this exact shape:
{
  success: true,
  results: [
    {
      title: "Action Title",
      description: "Detailed result description",
      fields: [{ name: "Field Name", value: "Field Value", inline: false }] // optional
    }
  ]
}

IMPORTANT:
- Wrap everything in (async () => { ... })();
- Use try-catch for ALL async operations
- Only push to results once per distinct result
- Include actual data in results (counts, names, etc.)
- Handle errors gracefully`;

        try {
            const aiResponse = await this.callGemini(
                'You are an expert Discord.js v14 code generator. Generate ONLY valid, executable JavaScript wrapped in (async () => { ... })(); format. Use ONLY Discord.js v14 syntax. Be precise and handle all edge cases.',
                prompt,
                2500,
                0.05
            );

            const codeMatch = aiResponse.match(/```(?:javascript|js)?\s*([\s\S]*?)```/);
            if (codeMatch) return codeMatch[1].trim();

            if (aiResponse.includes('(async ()')) return aiResponse.trim();

            throw new Error('Failed to extract valid code from AI response');
        } catch (error) {
            console.error('Code generation error:', error);
            throw error;
        }
    }

    /**
     * Validate and auto-fix common Discord.js v14 issues
     */
    validateAndFixCode(code) {
        let fixedCode = code;

        const deprecatedPatterns = [
            { old: /\.isText\(\)/g, replacement: '.type === ChannelType.GuildText' },
            { old: /\.isTextBased\(\)/g, replacement: '.type === ChannelType.GuildText' },
            { old: /\.isDM\(\)/g, replacement: '.type === ChannelType.DM' },
            { old: /\.isThread\(\)/g, replacement: '[ChannelType.PublicThread, ChannelType.PrivateThread].includes(channel.type)' },
        ];

        let hasChanges = false;
        for (const pattern of deprecatedPatterns) {
            if (pattern.old.test(fixedCode)) {
                console.warn(`⚠️ Found deprecated pattern: ${pattern.old}`);
                fixedCode = fixedCode.replace(pattern.old, pattern.replacement);
                hasChanges = true;
            }
        }

        if (hasChanges) console.log('✅ Automatically fixed deprecated Discord.js patterns');

        return fixedCode;
    }

    /**
     * Execute generated code safely, injecting geminiClient
     */
    async executeCode(code, message) {
        try {
            const { PermissionFlagsBits, ChannelType, EmbedBuilder, Colors } = require('discord.js');
            const guild = message.guild;
            const client = message.client;
            const channel = message.channel;
            const geminiClient = this.genAI; // GoogleGenerativeAI instance

            const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
            const executor = new AsyncFunction(
                'message', 'guild', 'client', 'channel', 'geminiClient',
                'PermissionFlagsBits', 'ChannelType', 'EmbedBuilder', 'Colors',
                `return ${code}`
            );

            const result = await executor(
                message, guild, client, channel, geminiClient,
                PermissionFlagsBits, ChannelType, EmbedBuilder, Colors
            );

            return result;
        } catch (error) {
            console.error('Code execution error:', error);
            const explanation = await this.explainError(error, code);
            return {
                success: false,
                results: [{ title: '❌ Execution Error', description: explanation }]
            };
        }
    }

    /**
     * AI-powered error explanation
     */
    async explainError(error, code) {
        const prompt = `Explain this Discord.js error simply:

Error: ${error.message}
Stack: ${error.stack?.split('\n').slice(0, 3).join('\n') || 'N/A'}

Code snippet:
\`\`\`javascript
${code.substring(0, 500)}
\`\`\`

Provide a brief, user-friendly explanation (max 250 chars) of what went wrong.`;

        try {
            const explanation = await this.callGemini(
                'Explain errors simply and concisely for Discord users.',
                prompt,
                150,
                0.2
            );
            const trimmed = explanation.trim();
            return trimmed.length > 300 ? trimmed.substring(0, 297) + '...' : trimmed;
        } catch (err) {
            return error.message;
        }
    }

    /**
     * Create confirmation prompt with detailed preview
     */
    async requestConfirmation(message, analysis, resolved, repliedData) {
        const confirmationId = `confirm_${Date.now()}_${message.author.id}`;

        const dangers = this.isDangerousAction(analysis);
        const isBlocked = dangers.isDangerous;

        const embed = new EmbedBuilder()
            .setColor(isBlocked ? Colors.Red : (dangers.reasons.length > 0 ? Colors.Orange : Colors.Blue))
            .setTitle(isBlocked ? '🚫 Dangerous Action - Requires Review' : '⚠️ Confirmation Required')
            .setDescription(`**Action:** ${analysis.description}`)
            .setFooter({ text: isBlocked ? 'Please review carefully before confirming.' : 'You have 60 seconds to respond.' });

        if (analysis.detailedSteps && analysis.detailedSteps.length > 0) {
            const stepsText = analysis.detailedSteps.map((step, i) => `${i + 1}. ${step}`).join('\n');

            if (stepsText.length > 1024) {
                const chunks = stepsText.match(/.{1,1024}/g);
                chunks.forEach((chunk, i) => {
                    embed.addFields({ name: i === 0 ? '📋 What will happen:' : '📋 Continued:', value: chunk });
                });
            } else {
                embed.addFields({ name: '📋 What will happen:', value: stepsText });
            }
        }

        if (dangers.reasons.length > 0) {
            embed.addFields({
                name: isBlocked ? '🚨 Critical Warnings' : '⚠️ Warnings',
                value: dangers.reasons.join('\n'),
                inline: false
            });
        }

        if (resolved.users.length > 0) {
            const userText = resolved.users.map(u => `• ${u.username} (${u.id})`).join('\n');
            embed.addFields({
                name: `👥 Users (${resolved.users.length})`,
                value: userText.length > 1024 ? userText.substring(0, 1021) + '...' : userText,
                inline: true
            });
        }
        if (resolved.roles.length > 0) {
            const roleText = resolved.roles.map(r => `• ${r.name}`).join('\n');
            embed.addFields({
                name: `🎭 Roles (${resolved.roles.length})`,
                value: roleText.length > 1024 ? roleText.substring(0, 1021) + '...' : roleText,
                inline: true
            });
        }
        if (resolved.channels.length > 0) {
            const channelText = resolved.channels.map(c => `• #${c.name}`).join('\n');
            embed.addFields({
                name: `📝 Channels (${resolved.channels.length})`,
                value: channelText.length > 1024 ? channelText.substring(0, 1021) + '...' : channelText,
                inline: true
            });
        }

        if (analysis.parameters && Object.keys(analysis.parameters).length > 0) {
            const paramsText = Object.entries(analysis.parameters)
                .map(([key, value]) => `• **${key}:** ${JSON.stringify(value)}`)
                .join('\n');
            embed.addFields({
                name: '⚙️ Parameters',
                value: paramsText.length > 1024 ? paramsText.substring(0, 1021) + '...' : paramsText
            });
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`${confirmationId}_confirm`)
                    .setLabel('Confirm & Execute')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId(`${confirmationId}_cancel`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌')
            );

        const confirmMsg = await message.reply({ embeds: [embed], components: [row] });

        this.pendingConfirmations.set(confirmationId, {
            analysis,
            resolved,
            message,
            repliedData,
            authorId: message.author.id,
            expiresAt: Date.now() + 60000,
            blocked: isBlocked,
            confirmMsgId: confirmMsg.id
        });

        console.log(`✅ Confirmation created: ${confirmationId}`);

        setTimeout(() => {
            if (this.pendingConfirmations.has(confirmationId)) {
                this.pendingConfirmations.delete(confirmationId);
                console.log(`⏰ Confirmation expired: ${confirmationId}`);
                embed.setTitle('⏰ Confirmation Expired').setColor(Colors.DarkRed);
                confirmMsg.edit({ embeds: [embed], components: [] }).catch(() => { });
            }
        }, 60000);

        return confirmationId;
    }

    /**
     * Handle confirmation button interactions
     */
    async handleConfirmation(interaction, confirmed) {
        const customId = interaction.customId;
        const confirmationId = customId.replace(/_confirm$|_cancel$/, '');

        console.log(`🔘 Button clicked: ${customId}`);
        console.log(`🔑 Confirmation ID: ${confirmationId}`);

        const confirmData = this.pendingConfirmations.get(confirmationId);

        if (!confirmData) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription('❌ This confirmation has expired or is invalid.')],
                ephemeral: true
            });
        }

        if (Date.now() > confirmData.expiresAt) {
            this.pendingConfirmations.delete(confirmationId);
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription('❌ This confirmation has expired.')],
                ephemeral: true
            });
        }

        if (confirmData.authorId !== interaction.user.id) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription('❌ Only the person who initiated this action can confirm it.')],
                ephemeral: true
            });
        }

        this.pendingConfirmations.delete(confirmationId);

        const originalEmbed = interaction.message.embeds[0];

        if (!confirmed) {
            const cancelledEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(Colors.Red)
                .setTitle('❌ Action Cancelled')
                .setFooter({ text: 'Operation was cancelled by user.' });
            await interaction.update({ embeds: [cancelledEmbed], components: [] });
            return;
        }

        const processingEmbed = EmbedBuilder.from(originalEmbed)
            .setColor(Colors.Yellow)
            .setTitle('⏳ Processing Action...')
            .setFooter({ text: 'Generating and executing code...' });

        await interaction.update({ embeds: [processingEmbed], components: [] });

        try {
            console.log('🔧 Generating code...');
            const code = await this.generateCode(
                confirmData.analysis,
                confirmData.resolved,
                confirmData.message,
                confirmData.repliedData
            );

            console.log('📝 Generated Code:\n', code);

            const validatedCode = this.validateAndFixCode(code);
            console.log('✅ Code validated');

            console.log('⚙️ Executing code...');
            const result = await this.executeCode(validatedCode, confirmData.message);

            const completedEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(result.success ? Colors.Green : Colors.Red)
                .setTitle(result.success ? '✅ Action Completed' : '❌ Action Failed')
                .setFooter({ text: result.success ? 'Results shown below' : 'Error details shown below' });

            await interaction.editReply({ embeds: [completedEmbed] });

            if (result && result.results && result.results.length > 0) {
                const seen = new Set();
                const uniqueResults = result.results.filter(output => {
                    const key = `${output.title || ''}:${output.description || ''}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });

                for (const output of uniqueResults) {
                    const outputEmbed = new EmbedBuilder()
                        .setColor(result.success ? Colors.Blue : Colors.Red)
                        .setTitle(output.title || '📊 Result')
                        .setTimestamp();

                    if (output.description) {
                        outputEmbed.setDescription(
                            output.description.length > 4096
                                ? output.description.substring(0, 4093) + '...'
                                : output.description
                        );
                    }

                    if (output.fields && output.fields.length > 0) {
                        outputEmbed.addFields(output.fields.slice(0, 25));
                    }

                    await confirmData.message.channel.send({ embeds: [outputEmbed] });
                }
            } else {
                await confirmData.message.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(Colors.Blue)
                            .setTitle('📊 Result')
                            .setDescription('Action completed successfully with no output.')
                            .setTimestamp()
                    ]
                });
            }

        } catch (error) {
            console.error('💥 Execution error:', error);

            const errorEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(Colors.Red)
                .setTitle('❌ Action Failed')
                .setFooter({ text: 'An error occurred during execution.' });

            await interaction.editReply({ embeds: [errorEmbed] });

            const errorOutputEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ Execution Error')
                .setDescription(error.message || 'An unknown error occurred')
                .setTimestamp();

            if (error.stack) {
                const stackPreview = error.stack.split('\n').slice(0, 5).join('\n');
                errorOutputEmbed.addFields({
                    name: 'Stack Trace',
                    value: '```' + (stackPreview.length > 1010 ? stackPreview.substring(0, 1010) + '...' : stackPreview) + '```'
                });
            }

            await confirmData.message.channel.send({ embeds: [errorOutputEmbed] });
        }
    }

    /**
     * Main process handler - entry point called by mcreate.js
     */
    async process(message, userMessage) {
        console.log(`[SpectreAI] Processing request from ${message.author.tag}: "${userMessage}"`);

        // SECURITY CHECK
        if (!this.hasPermission(message.member, message.author.id)) {
            console.warn(`[SpectreAI] Permission Denied: ${message.author.id}`);
            return {
                type: 'error',
                embed: new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setDescription('❌ **Access Denied**\nThis bot is restricted to authorized users only.')
                    .setFooter({ text: 'Only the bot owner can execute AI actions.' })
            };
        }

        try {
            await message.channel.sendTyping();
        } catch (e) {
            console.error('[SpectreAI] Failed to send typing indicator:', e.message);
        }

        try {
            const { analysis, resolved, repliedData } = await this.analyzeRequest(message, userMessage);
            await this.requestConfirmation(message, analysis, resolved, repliedData);
            return { type: 'confirmation_pending' };
        } catch (error) {
            console.error('SpectreAI processing error:', error);
            return {
                type: 'error',
                embed: new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setTitle('❌ Processing Error')
                    .setDescription(`An error occurred while analyzing your request:\n\`\`\`${error.message}\`\`\``)
                    .setFooter({ text: 'Please try rephrasing your request or report this issue.' })
            };
        }
    }
}

module.exports = new SpectreAI();