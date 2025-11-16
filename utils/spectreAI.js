const { HfInference } = require('@huggingface/inference');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Colors } = require('discord.js');
const entityResolver = require('./entityResolver');
require('dotenv').config();

class SpectreAI {
    constructor() {
        this.hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
        this.entityResolver = entityResolver;
        this.pendingConfirmations = new Map();
    }

    /**
     * Check if user has permission to execute actions
     */
    hasPermission(member, userId) {
        // Special user ID
        if (userId === '753491023208120321') {
            return true;
        }

        // Check admin permission
        if (member && member.permissions.has('Administrator')) {
            return true;
        }

        return false;
    }

    /**
     * Enhanced context extraction including reply data
     */
    async buildContextInfo(message) {
        let context = `- Current Channel: #${message.channel.name} (ID: ${message.channel.id})`;
        context += `\n- Message Author: ${message.author.username} (ID: ${message.author.id})`;

        if (message.channel.parent) {
            context += `\n- Current Category: ${message.channel.parent.name} (ID: ${message.channel.parent.id})`;
        }

        // Get replied message data if exists
        if (message.reference) {
            try {
                const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
                context += `\n- Replying to: ${repliedMsg.author.username} (ID: ${repliedMsg.author.id})`;
                context += `\n- Replied Message Content: "${repliedMsg.content}"`;

                if (repliedMsg.embeds.length > 0) {
                    const embed = repliedMsg.embeds[0];
                    context += `\n- Replied Message Has Embed:`;
                    if (embed.title) context += `\n  - Title: ${embed.title}`;
                    if (embed.description) context += `\n  - Description: ${embed.description}`;
                    if (embed.fields && embed.fields.length > 0) {
                        context += `\n  - Fields: ${embed.fields.map(f => `${f.name}: ${f.value}`).join(', ')}`;
                    }
                }
            } catch (error) {
                console.error('Failed to fetch replied message:', error);
            }
        }

        return context;
    }

    /**
     * Analyze the request and detect dangerous actions
     */
    async analyzeRequest(message, userMessage) {
        const contextInfo = await this.buildContextInfo(message);

        const prompt = `You are a Discord action analyzer. Analyze what the user wants to do and extract all relevant information.

User Message: "${userMessage}"

Context:
${contextInfo}

Discord Entities Explained:
- Users: Members of the server (can be mentioned with @username or by name)
- Roles: Permission groups (can be mentioned with @rolename or by name)
- Channels: Text/voice channels (can be mentioned with #channel or by name)
- Categories: Groups of channels

IMPORTANT Context Terms:
- "this channel" / "here" = the channel where command was sent (${message.channel.name})
- "this user" (when replying) = the user whose message is being replied to
- "me" / "my" / "I" = the command author (${message.author.username})
- "this category" = the category containing current channel
- If user says "translate this" or similar without specifying text, use the replied message content
- If replying to an embed, use the embed's content for actions

Your Task:
1. Identify the ACTION (what to do)
2. Identify TARGET entities (users, roles, channels, categories)
3. Extract any PARAMETERS (names, values, settings)
4. Detect dangerous bulk operations
5. Count how many times an action will repeat

Respond with ONLY valid JSON:
{
  "action": "descriptive action like 'create_channel', 'send_message', 'translate_text'",
  "description": "human readable description",
  "entities": {
    "users": ["username1"],
    "roles": ["rolename1"],
    "channels": ["channelname1"],
    "categories": ["categoryname1"]
  },
  "parameters": {
    "name": "value",
    "count": number,
    "text": "content to process"
  },
  "usesContext": {
    "currentChannel": true/false,
    "currentCategory": true/false,
    "repliedUser": true/false,
    "repliedMessage": true/false,
    "repliedEmbed": true/false,
    "messageAuthor": true/false
  },
  "dangerLevel": "safe/warning/dangerous",
  "dangerReasons": ["reason1", "reason2"],
  "actionCount": 1,
  "requiresConfirmation": true
}

Danger Detection Rules:
- "dangerous" if: deleting multiple channels (3+), banning multiple users (3+), mass role deletion (2+), deleting categories, sending 10+ messages
- "warning" if: deleting any channel/role, banning users, permission changes affecting many users
- "safe" if: creating things, reading info, translating, single non-destructive actions

Action Count: If user says "send me 5 messages", actionCount = 5. If "delete all channels", count channels in guild.

Examples:
"translate this" (while replying to message) →
{
  "action": "translate_text",
  "description": "Translate the replied message to English",
  "parameters": {"text": "[content from replied message]"},
  "usesContext": {"repliedMessage": true},
  "dangerLevel": "safe",
  "actionCount": 1
}

"give me admin role" →
{
  "action": "assign_role",
  "description": "Assign admin role to command author",
  "entities": {"roles": ["admin"]},
  "usesContext": {"messageAuthor": true},
  "dangerLevel": "warning",
  "actionCount": 1
}`;

        try {
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    { role: "system", content: "You are a Discord action analyzer. Respond only with valid JSON." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 800,
                temperature: 0.2
            });

            const aiResponse = response.choices[0].message.content;
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                parsed.requiresConfirmation = true;
                return parsed;
            }

            throw new Error('Failed to parse AI response');
        } catch (error) {
            console.error('Request analysis error:', error);
            throw error;
        }
    }

    /**
     * Resolve entity names to actual Discord objects
     */
    async resolveEntities(analysis, message) {
        const resolved = {
            users: [],
            roles: [],
            channels: [],
            categories: [],
            repliedMessageContent: null,
            repliedEmbedData: null
        };

        // Handle context-based entities
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
            if (analysis.usesContext.repliedUser && message.reference) {
                try {
                    const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
                    if (!resolved.users.find(u => u.id === repliedMsg.author.id)) {
                        resolved.users.push(repliedMsg.author);
                    }
                } catch (error) {
                    console.error('Failed to fetch replied message');
                }
            }
            if (analysis.usesContext.repliedMessage && message.reference) {
                try {
                    const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
                    resolved.repliedMessageContent = repliedMsg.content;
                } catch (error) {
                    console.error('Failed to fetch replied message');
                }
            }
            if (analysis.usesContext.repliedEmbed && message.reference) {
                try {
                    const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
                    if (repliedMsg.embeds.length > 0) {
                        resolved.repliedEmbedData = repliedMsg.embeds[0];
                    }
                } catch (error) {
                    console.error('Failed to fetch replied embed');
                }
            }
        }

        // Resolve entity names
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

        // Check mentions
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
     * Generate Discord.js v14 code with safety measures
     */
    async generateCode(analysis, resolved, message) {
        // Build resolved entities string with reply data
        let resolvedInfo = `
Resolved Entities:
- Users: ${resolved.users.map(u => `${u.username} (ID: ${u.id})`).join(', ') || 'none'}
- Roles: ${resolved.roles.map(r => `${r.name} (ID: ${r.id})`).join(', ') || 'none'}
- Channels: ${resolved.channels.map(c => `${c.name} (ID: ${c.id})`).join(', ') || 'none'}
- Categories: ${resolved.categories.map(c => `${c.name} (ID: ${c.id})`).join(', ') || 'none'}`;

        if (resolved.repliedMessageContent) {
            resolvedInfo += `\n- Replied Message Content: "${resolved.repliedMessageContent}"`;
        }
        if (resolved.repliedEmbedData) {
            resolvedInfo += `\n- Replied Embed Data: ${JSON.stringify({
                title: resolved.repliedEmbedData.title,
                description: resolved.repliedEmbedData.description,
                fields: resolved.repliedEmbedData.fields
            })}`;
        }

        const prompt = `Generate Discord.js v14 code to perform this action.

Action: ${analysis.action}
Description: ${analysis.description}

${resolvedInfo}

Parameters: ${JSON.stringify(analysis.parameters)}

Context:
- Message Channel ID: ${message.channel.id}
- Message Guild ID: ${message.guild.id}
- Message Author ID: ${message.author.id}

CRITICAL REQUIREMENTS:
1. Use ONLY Discord.js v14+ syntax
2. Use PermissionFlagsBits for permissions
3. Use ChannelType enum for channel types
4. All async operations must use await
5. Return: { success: boolean, embed: EmbedBuilder }
6. Handle errors with try-catch
7. Available: message, guild, client, EmbedBuilder, Colors
8. **ALL OUTPUT MUST BE IN EMBEDS - NEVER USE PLAIN TEXT MESSAGES**
9. **ALWAYS use channel.send({ embeds: [embed] }) - NEVER channel.send("text")**
10. You CAN mention users and roles in embeds (they won't ping in embeds)
11. Use Colors from discord.js for embed colors

EMBED FIELD LIMITS:
- Field values must be ≤ 1024 characters
- If content > 1024 chars, split into multiple fields
- Field name example: "Results (1/3)", "Results (2/3)"
- Max 25 fields per embed

BATCHING FOR LARGE OPERATIONS:
- If operation repeats 30+ times, use batches
- Process in chunks, add delays between batches
- Example: \`for (let i = 0; i < items.length; i += 30) { await processBatch(items.slice(i, i+30)); await new Promise(r => setTimeout(r, 1000)); }\`

Example (correct):
\`\`\`javascript
(async () => {
    try {
        const results = "very long text..."; // Assume > 1024 chars
        
        // Split into chunks
        const chunks = [];
        for (let i = 0; i < results.length; i += 1000) {
            chunks.push(results.slice(i, i + 1000));
        }
        
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('Results');
        
        chunks.forEach((chunk, i) => {
            embed.addFields({ 
                name: \`Part \${i + 1}/\${chunks.length}\`, 
                value: chunk 
            });
        });
        
        await channel.send({ embeds: [embed] });
        
        return { 
            success: true, 
            embed: new EmbedBuilder()
                .setColor(Colors.Green)
                .setDescription('✅ Action completed')
        };
    } catch (error) {
        return { 
            success: false, 
            embed: new EmbedBuilder()
                .setColor(Colors.Red)
                .setDescription(\`❌ Error: \${error.message}\`)
        };
    }
})();
\`\`\`

Generate the code now:`;

        try {
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    { role: "system", content: "You are a Discord.js v14 code generator. Only generate code that outputs embeds, never plain text." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 1500,
                temperature: 0.3
            });

            const aiResponse = response.choices[0].message.content;
            const codeMatch = aiResponse.match(/```(?:javascript)?\s*([\s\S]*?)```/);

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
     * Analyze generated code to explain what it will do
     */
    async analyzeGeneratedCode(code, analysis, resolved) {
        const prompt = `Analyze this Discord.js code and explain EXACTLY what it will do in clear, specific steps.

Code:
\`\`\`javascript
${code}
\`\`\`

Original Action: ${analysis.description}

Provide detailed, step-by-step explanation. Be specific about:
- Which Discord API methods are called
- What permissions are modified
- Which channels/roles/users are affected
- What messages are sent and where
- Any batching or chunking logic

Format as numbered steps. Be technical and precise.`;

        try {
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    { role: "system", content: "You are a code analyzer. Explain Discord.js code in clear steps." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 600,
                temperature: 0.2
            });

            const explanation = response.choices[0].message.content.trim();

            const steps = [];
            const lines = explanation.split('\n');

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (/^\d+[\.\)]\s+/.test(trimmedLine)) {
                    const step = trimmedLine.replace(/^\d+[\.\)]\s+/, '');
                    if (step.length > 0) {
                        steps.push(step);
                    }
                }
            }

            return steps.length > 0 ? steps : [explanation];
        } catch (error) {
            console.error('Code analysis error:', error);
            return ['Execute the requested action'];
        }
    }

    /**
     * Use AI to explain what went wrong with an error
     */
    async explainError(error, code, analysis) {
        const prompt = `A Discord.js code execution failed with this error:

Error: ${error.message}
Stack: ${error.stack || 'N/A'}

Code that failed:
\`\`\`javascript
${code.substring(0, 500)}...
\`\`\`

Action attempted: ${analysis.description}

Explain in simple terms:
1. What went wrong
2. Why it happened
3. What the user should check

Keep it concise and user-friendly. No code, just explanation.`;

        try {
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    { role: "system", content: "You are a helpful error explainer. Make technical errors understandable." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 300,
                temperature: 0.3
            });

            return response.choices[0].message.content.trim();
        } catch (aiError) {
            return error.message;
        }
    }

    /**
     * Execute generated code safely
     */
    async executeCode(code, message) {
        try {
            const { PermissionFlagsBits, ChannelType, EmbedBuilder, Colors } = require('discord.js');
            const guild = message.guild;
            const client = message.client;
            const channel = message.channel;

            const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
            const executor = new AsyncFunction(
                'message', 'guild', 'client', 'channel',
                'PermissionFlagsBits', 'ChannelType', 'EmbedBuilder', 'Colors',
                `return ${code}`
            );

            const result = await executor(
                message, guild, client, channel,
                PermissionFlagsBits, ChannelType, EmbedBuilder, Colors
            );

            return result;
        } catch (error) {
            console.error('Code execution error:', error);
            return {
                success: false,
                embed: new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setDescription(`❌ Execution error: ${error.message}`),
                error: error
            };
        }
    }

    /**
     * Create confirmation prompt with safety warnings
     */
    async requestConfirmation(message, analysis, resolved, code, detailedSteps) {
        const confirmationId = `confirm_${Date.now()}_${message.author.id}`;

        // Determine color based on danger level
        let embedColor = Colors.Orange;
        if (analysis.dangerLevel === 'dangerous') embedColor = Colors.Red;
        else if (analysis.dangerLevel === 'safe') embedColor = Colors.Blue;

        const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setTitle('⚠️ Confirmation Required')
            .setDescription(`**Action:** ${analysis.description}`)
            .setFooter({ text: 'This action requires confirmation. You have 60 seconds to respond.' });

        // Add danger warnings
        if (analysis.dangerLevel === 'dangerous') {
            embed.addFields({
                name: '🚨 DANGEROUS ACTION',
                value: analysis.dangerReasons.join('\n') || 'This action could cause significant changes to the server.',
                inline: false
            });
        } else if (analysis.dangerLevel === 'warning' && analysis.dangerReasons) {
            embed.addFields({
                name: '⚠️ Warning',
                value: analysis.dangerReasons.join('\n'),
                inline: false
            });
        }

        // Add detailed steps
        if (detailedSteps && detailedSteps.length > 0) {
            let stepsText = '';
            detailedSteps.forEach((step, index) => {
                stepsText += `${index + 1}. ${step}\n`;
            });
            // Split if too long
            if (stepsText.length > 1024) {
                const chunks = [];
                let currentChunk = '';
                detailedSteps.forEach((step, index) => {
                    const line = `${index + 1}. ${step}\n`;
                    if ((currentChunk + line).length > 1000) {
                        chunks.push(currentChunk);
                        currentChunk = line;
                    } else {
                        currentChunk += line;
                    }
                });
                if (currentChunk) chunks.push(currentChunk);

                chunks.forEach((chunk, i) => {
                    embed.addFields({
                        name: `📋 What will happen (${i + 1}/${chunks.length}):`,
                        value: chunk
                    });
                });
            } else {
                embed.addFields({ name: '📋 What will happen:', value: stepsText });
            }
        }

        // Add affected entities
        if (resolved.users.length > 0) {
            const userList = resolved.users.map(u => `${u.username} (${u.id})`).join('\n');
            if (userList.length > 1024) {
                embed.addFields({ name: '👥 Users', value: `${resolved.users.length} users affected`, inline: true });
            } else {
                embed.addFields({ name: '👥 Users', value: userList, inline: true });
            }
        }
        if (resolved.roles.length > 0) {
            embed.addFields({
                name: '🎭 Roles',
                value: resolved.roles.map(r => `${r.name} (${r.id})`).join('\n').substring(0, 1024),
                inline: true
            });
        }
        if (resolved.channels.length > 0) {
            embed.addFields({
                name: '📝 Channels',
                value: resolved.channels.map(c => `#${c.name} (${c.id})`).join('\n').substring(0, 1024),
                inline: true
            });
        }

        // Add parameters
        if (analysis.parameters && Object.keys(analysis.parameters).length > 0) {
            const paramsText = Object.entries(analysis.parameters)
                .map(([key, value]) => `**${key}:** ${value}`)
                .join('\n');
            embed.addFields({ name: '⚙️ Parameters', value: paramsText.substring(0, 1024) });
        }

        // Check if blocked
        const isBlocked = analysis.dangerLevel === 'dangerous' ||
            (analysis.actionCount && analysis.actionCount > 10);

        if (isBlocked) {
            embed.addFields({
                name: '🛑 Action Blocked',
                value: 'This action has been automatically blocked for safety reasons.',
                inline: false
            });
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`${confirmationId}_confirm`)
                    .setLabel('Confirm')
                    .setStyle(isBlocked ? ButtonStyle.Secondary : ButtonStyle.Danger)
                    .setEmoji('✅')
                    .setDisabled(isBlocked),
                new ButtonBuilder()
                    .setCustomId(`${confirmationId}_cancel`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('❌')
            );

        const confirmMsg = await message.reply({ embeds: [embed], components: [row] });

        this.pendingConfirmations.set(confirmationId, {
            analysis,
            resolved,
            message,
            code,
            authorId: message.author.id,
            expiresAt: Date.now() + 60000,
            blocked: isBlocked
        });

        setTimeout(() => {
            if (this.pendingConfirmations.has(confirmationId)) {
                this.pendingConfirmations.delete(confirmationId);
                embed.setTitle('⏰ Confirmation Expired')
                    .setColor(Colors.Red);
                confirmMsg.edit({ embeds: [embed], components: [] }).catch(() => { });
            }
        }, 60000);

        return confirmationId;
    }

    /**
     * Handle confirmation button clicks
     */
    async handleConfirmation(interaction, confirmed) {
        const confirmationId = interaction.customId.replace('_confirm', '').replace('_cancel', '');
        const confirmData = this.pendingConfirmations.get(confirmationId);

        if (!confirmData) {
            const expiredEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setDescription('❌ This confirmation has expired.');
            return interaction.reply({ embeds: [expiredEmbed], ephemeral: true });
        }

        if (confirmData.authorId !== interaction.user.id) {
            const deniedEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setDescription('❌ Only the person who initiated this action can confirm it.');
            return interaction.reply({ embeds: [deniedEmbed], ephemeral: true });
        }

        this.pendingConfirmations.delete(confirmationId);

        const originalEmbedData = interaction.message.embeds[0];

        if (!confirmed) {
            const cancelledEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ Action Cancelled')
                .setDescription(originalEmbedData.description)
                .setFooter(originalEmbedData.footer);

            if (originalEmbedData.fields && originalEmbedData.fields.length > 0) {
                cancelledEmbed.addFields(originalEmbedData.fields);
            }

            await interaction.update({ embeds: [cancelledEmbed], components: [] });
            return;
        }

        if (confirmData.blocked) {
            const blockedEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ Action Blocked')
                .setDescription(originalEmbedData.description)
                .setFooter(originalEmbedData.footer);

            if (originalEmbedData.fields && originalEmbedData.fields.length > 0) {
                blockedEmbed.addFields(originalEmbedData.fields);
            }

            await interaction.update({ embeds: [blockedEmbed], components: [] });
            return;
        }

        const confirmedEmbed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('✅ Action Confirmed')
            .setDescription(originalEmbedData.description)
            .setFooter({ text: 'Executing action...' });

        if (originalEmbedData.fields && originalEmbedData.fields.length > 0) {
            confirmedEmbed.addFields(originalEmbedData.fields);
        }

        await interaction.update({ embeds: [confirmedEmbed], components: [] });

        try {
            console.log('Executing Code:', confirmData.code);
            const result = await this.executeCode(confirmData.code, confirmData.message);

            if (result && result.embed) {
                await confirmData.message.channel.send({ embeds: [result.embed] });
            } else {
                const fallbackEmbed = new EmbedBuilder()
                    .setColor(Colors.Orange)
                    .setTitle('⚠️ Action Completed')
                    .setDescription('Action completed but no valid response returned.');
                await confirmData.message.channel.send({ embeds: [fallbackEmbed] });
            }

            const completedConfirmEmbed = new EmbedBuilder()
                .setColor(Colors.Green)
                .setTitle('✅ Action Completed')
                .setDescription(originalEmbedData.description)
                .setFooter({ text: 'Action completed successfully. Result sent below.' });

            if (originalEmbedData.fields && originalEmbedData.fields.length > 0) {
                completedConfirmEmbed.addFields(originalEmbedData.fields);
            }

            await interaction.editReply({ embeds: [completedConfirmEmbed] });

        } catch (error) {
            // Use AI to explain the error
            const errorExplanation = await this.explainError(error, confirmData.code, confirmData.analysis);

            const errorEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ Action Failed')
                .setDescription(errorExplanation)
                .addFields({ name: 'Technical Error', value: error.message.substring(0, 1024) })
                .setTimestamp();

            await confirmData.message.channel.send({ embeds: [errorEmbed] });

            const failedConfirmEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ Action Failed')
                .setDescription(originalEmbedData.description)
                .setFooter({ text: 'Action failed. Error details sent below.' });

            if (originalEmbedData.fields && originalEmbedData.fields.length > 0) {
                failedConfirmEmbed.addFields(originalEmbedData.fields);
            }

            await interaction.editReply({ embeds: [failedConfirmEmbed] });
        }
    }

    /**
     * Main process handler
     */
    async process(message, userMessage) {
        try {
            // Check permissions
            if (!this.hasPermission(message.member, message.author.id)) {
                return {
                    type: 'error',
                    embed: new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setDescription('❌ You need Administrator permissions to execute actions.')
                };
            }

            // Step 1: Analyze request with enhanced context
            const analysis = await this.analyzeRequest(message, userMessage);

            // Step 2: Resolve entities including reply data
            const resolved = await this.resolveEntities(analysis, message);

            // Step 3: Generate code with safety measures
            const code = await this.generateCode(analysis, resolved, message);
            console.log('Generated Code:', code);

            // Step 4: Analyze the generated code
            const detailedSteps = await this.analyzeGeneratedCode(code, analysis, resolved);

            // Step 5: Request confirmation with all safety checks
            await this.requestConfirmation(message, analysis, resolved, code, detailedSteps);
            return { type: 'confirmation_pending' };

        } catch (error) {
            console.error('Spectre AI processing error:', error);
            return {
                type: 'error',
                embed: new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setDescription(`❌ An error occurred: ${error.message}`)
            };
        }
    }
}

module.exports = new SpectreAI();