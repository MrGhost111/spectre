const { HfInference } = require('@huggingface/inference');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Colors } = require('discord.js');
const entityResolver = require('./entityResolver');
require('dotenv').config();

class SpectreAI {
    constructor() {
        console.log('🤖 SpectreAI instance created');
        this.hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
        this.entityResolver = entityResolver;
        this.pendingConfirmations = new Map();
        this.ADMIN_ID = '753491023208120321';
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
     * Generate Discord.js v14 code with proper batching and splitting
     */
    async generateCode(analysis, resolved, message, repliedData, progressMsg) {
        await progressMsg.edit({
            embeds: [new EmbedBuilder()
                .setColor(Colors.Yellow)
                .setTitle('⏳ Generating Code...')
                .setDescription('Creating execution plan...')
                .setTimestamp()]
        });

        const prompt = `Generate Discord.js v14 code to perform this action.

IMPORTANT: DO NOT use require() statements in your code.All Discord.js components are already available.

Available variables in scope:
        - PermissionFlagsBits, ChannelType, EmbedBuilder, Colors(from discord.js)
            - message, guild, client, channel(Discord objects)
            - console, setTimeout, setInterval, Promise, Date, JSON, Math(standard JS)

DO NOT USE:
        - const { anything } = require('discord.js');
        - const discord = require('discord.js');

INSTEAD USE:
        - PermissionFlagsBits.Administrator(already imported)
            - ChannelType.GuildText(already imported)
            - new EmbedBuilder()(already imported)
            - Colors.Red(already imported)

Action: ${analysis.action}
Description: ${analysis.description}

Resolved Entities:
- Users: ${resolved.users.map(u => `${u.username} (ID: ${u.id})`).join(', ') || 'none'}
- Roles: ${resolved.roles.map(r => `${r.name} (ID: ${r.id})`).join(', ') || 'none'}
- Channels: ${resolved.channels.map(c => `${c.name} (ID: ${c.id})`).join(', ') || 'none'}
- Categories: ${resolved.categories.map(c => `${c.name} (ID: ${c.id})`).join(', ') || 'none'}

Parameters: ${JSON.stringify(analysis.parameters)}

${repliedData ? `Replied Message Data:
- Content: ${repliedData.content}
- Embeds: ${JSON.stringify(repliedData.embeds)}` : ''}

Context:
- Message Channel ID: ${message.channel.id}
- Message Guild ID: ${message.guild.id}
- Message Author ID: ${message.author.id}

CRITICAL REQUIREMENTS:
1. Use ONLY Discord.js v14+ syntax
2. Use PermissionFlagsBits for permissions
3. Use ChannelType enum for channel types
4. Return: { success: boolean, results: Array<{title: string, description: string, fields?: Array}> }
5. ALL OUTPUT MUST BE IN EMBEDS - results array will be used to create multiple embeds
6. Mentions in embeds DON'T PING - use <@userId>, <@&roleId>, <#channelId> freely
7. Handle large data by splitting:
   - If description > 4000 chars, split into multiple result objects
   - If field value > 1024 chars, split into multiple fields
   - If total fields > 25, split into multiple embeds
8. For operations on >100 items, process in batches of 100
9. For fetching messages beyond 100, use batching:
   \`\`\`javascript
   let allMessages = [];
   let lastId;
   while (allMessages.length < targetAmount) {
       const options = { limit: 100 };
       if (lastId) options.before = lastId;
       const batch = await channel.messages.fetch(options);
       if (batch.size === 0) break;
       allMessages.push(...batch.values());
       lastId = batch.last().id;
   }
   \`\`\`
10. NEVER send plain text messages - only embeds via results array
11. Handle ALL errors gracefully with try-catch
12. Use Colors from discord.js for embed colors

Example for splitting long lists:
\`\`\`javascript
(async () => {
    try {
        const results = [];
        const items = [...]; // large array
        
        // Split items into chunks for embed fields (each field max 1024 chars)
        const formatChunk = (chunk) => chunk.map(i => \`• \${i}\`).join('\\n');
        
        let currentChunk = [];
        let currentLength = 0;
        const fields = [];
        
        for (const item of items) {
            const line = \`• \${item}\\n\`;
            if (currentLength + line.length > 1024) {
                fields.push({ name: 'Items', value: formatChunk(currentChunk) });
                currentChunk = [item];
                currentLength = line.length;
            } else {
                currentChunk.push(item);
                currentLength += line.length;
            }
        }
        if (currentChunk.length > 0) {
            fields.push({ name: 'Items', value: formatChunk(currentChunk) });
        }
        
        // Split into multiple embeds if >25 fields
        while (fields.length > 0) {
            const embedFields = fields.splice(0, 25);
            results.push({
                title: 'Results',
                description: \`Showing \${embedFields.length} fields\`,
                fields: embedFields
            });
        }
        
        return { success: true, results };
    } catch (error) {
        return { 
            success: false, 
            results: [{
                title: '❌ Error',
                description: error.message
            }]
        };
    }
})();
\`\`\`

Generate the code now:`;

        try {
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    { role: "system", content: "You are a Discord.js v14 code generator. Generate only executable JavaScript code with proper error handling and batching." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 2000,
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
     * Execute generated code safely
     */
    async executeCode(code, message) {
        try {
            const { PermissionFlagsBits, ChannelType, EmbedBuilder, Colors } = require('discord.js');
            const guild = message.guild;
            const client = message.client;
            const channel = message.channel;

            // Clean and wrap the code
            let cleanCode = code.trim();

            // Remove existing async wrappers if present
            if (cleanCode.startsWith('(async () => {') && cleanCode.endsWith('})()')) {
                cleanCode = cleanCode.slice(14, -4).trim();
            } else if (cleanCode.startsWith('(async function() {') && cleanCode.endsWith('})()')) {
                cleanCode = cleanCode.slice(19, -4).trim();
            }

            // Wrap in async function with proper return
            const wrappedCode = `
                return (async () => {
                    ${cleanCode}
                })();
            `;

            const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
            const executor = new AsyncFunction(
                'message', 'guild', 'client', 'channel',
                'PermissionFlagsBits', 'ChannelType', 'EmbedBuilder', 'Colors',
                wrappedCode
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
                results: [{
                    title: '❌ Execution Error',
                    description: `Error: ${error.message}\n\nPlease try rephrasing your request.`
                }]
            };
        }
    }

    /**
     * Analyze request and generate code BEFORE confirmation
     */
    async analyzeAndPrepare(message, userMessage, progressMsg) {
        const contextInfo = this.buildContextInfo(message);
        const repliedData = await this.getRepliedMessageData(message);

        const prompt = `You are a Discord action analyzer. Analyze what the user wants to do and extract all relevant information.

User Message: "${userMessage}"

Context:
${contextInfo}

${repliedData ? `Replied Message Data:
- Author: ${repliedData.author.username}
- Content: ${repliedData.content}
- Embeds: ${JSON.stringify(repliedData.embeds)}` : ''}


IMPORTANT CONTEXT TERMS:
- "this channel" / "here" = current channel (${message.channel.name})
- "this category" = current category (${message.channel.parent?.name || 'none'})
- "this user" (when replying) = the user being replied to
- "this message" (when replying) = the message being replied to
- "me" / "my" = the command author (${message.author.username})

IMPORTANT: Be careful with pronouns and context:
- If user says "ban wolfy", target ONLY wolfy, NOT the message author
- If user says "give me admin", target the message author
- If user says "delete this channel", target current channel
- If replying and says "ban this user", target the replied user

Discord Entities:
- Users: Members (mentioned with @username or by name)
- Roles: Permission groups (@rolename or by name)
- Channels: Text/voice channels (#channel or by name)
- Categories: Groups of channels

Your Task:
1. Identify the ACTION (what to do)
2. Identify TARGET entities (users, roles, channels, categories)
3. Extract PARAMETERS (names, values, settings)
4. Describe DETAILED STEPS of execution (be specific about what will happen)
5. Understand context correctly - don't confuse subjects

Respond with ONLY valid JSON:
{
  "action": "descriptive_action_name",
  "description": "Brief human readable description",
  "detailedSteps": [
    "Step 1: Specific action (e.g., 'Search for user named wolfy using entity resolver')",
    "Step 2: Another action (e.g., 'Ban the user if found')",
    "Step 3: Final step (e.g., 'Send result embed with ban confirmation')"
  ],
  "entities": {
    "users": ["username1"],
    "roles": ["rolename1"],
    "channels": ["channelname1"],
    "categories": ["categoryname1"]
  },
  "parameters": {
    "name": "value"
  },
  "usesContext": {
    "currentChannel": true/false,
    "currentCategory": true/false,
    "repliedUser": true/false,
    "repliedMessage": true/false,
    "messageAuthor": true/false
  }
}`;

        try {
            await progressMsg.edit({
                embeds: [new EmbedBuilder()
                    .setColor(Colors.Yellow)
                    .setTitle('⏳ Analyzing Request...')
                    .setDescription('Understanding what you want to do...')
                    .setTimestamp()]
            });

            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    { role: "system", content: "You are a Discord action analyzer. Respond only with valid JSON. Be careful with context and don't confuse subjects." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 800,
                temperature: 0.2
            });

            const aiResponse = response.choices[0].message.content;
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);

            if (!jsonMatch) {
                throw new Error('Failed to parse AI response');
            }

            const analysis = JSON.parse(jsonMatch[0]);

            // Resolve entities
            await progressMsg.edit({
                embeds: [new EmbedBuilder()
                    .setColor(Colors.Yellow)
                    .setTitle('⏳ Resolving Entities...')
                    .setDescription('Finding users, roles, and channels...')
                    .setTimestamp()]
            });

            const resolved = await this.resolveEntities(analysis, message, repliedData);

            // Generate code BEFORE showing confirmation
            const code = await this.generateCode(analysis, resolved, message, repliedData, progressMsg);

            return { analysis, resolved, repliedData, code };
        } catch (error) {
            console.error('Request analysis error:', error);
            throw error;
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
     * Create confirmation with code already generated
     */
    async createConfirmation(message, analysis, resolved, repliedData, code) {
        const confirmationId = `confirm_${Date.now()}_${message.author.id}`;

        // Check for dangerous actions
        const dangers = this.isDangerousAction(analysis, resolved);

        const embed = new EmbedBuilder()
            .setColor(dangers.isBlocked ? Colors.Red : Colors.Orange)
            .setTitle(dangers.isBlocked ? '🚫 Action Blocked' : '⚠️ Confirmation Required')
            .setFooter({ text: dangers.isBlocked ? 'This action has been blocked for safety.' : 'You have 60 seconds to respond.' });

        // Show what AI understood
        embed.addFields({
            name: '🎯 Action Understanding',
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
                        name: i === 0 ? '📋 Execution Plan' : '📋 Continued',
                        value: chunk,
                        inline: false
                    });
                });
            } else {
                embed.addFields({
                    name: '📋 Execution Plan',
                    value: stepsText,
                    inline: false
                });
            }
        }

        // Show affected entities (parameters)
        if (resolved.users.length > 0) {
            const userList = resolved.users.map(u => `• ${u.username} (${u.id})`).join('\n');
            embed.addFields({
                name: '👥 Target Users',
                value: this.truncateText(userList, 1024),
                inline: true
            });
        }

        if (resolved.roles.length > 0) {
            const roleList = resolved.roles.map(r => `• ${r.name} (${r.id})`).join('\n');
            embed.addFields({
                name: '🎭 Target Roles',
                value: this.truncateText(roleList, 1024),
                inline: true
            });
        }

        if (resolved.channels.length > 0) {
            const channelList = resolved.channels.map(c => `• #${c.name} (${c.id})`).join('\n');
            embed.addFields({
                name: '📝 Target Channels',
                value: this.truncateText(channelList, 1024),
                inline: true
            });
        }

        if (resolved.categories.length > 0) {
            const catList = resolved.categories.map(c => `• ${c.name} (${c.id})`).join('\n');
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

        const confirmMsg = await message.reply({ embeds: [embed], components: [row] });

        // Store confirmation with pre-generated code
        this.pendingConfirmations.set(confirmationId, {
            analysis,
            resolved,
            message,
            repliedData,
            code,
            authorId: message.author.id,
            expiresAt: Date.now() + 60000,
            blocked: dangers.isBlocked,
            confirmMsgId: confirmMsg.id
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
     * Handle confirmation button clicks
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

        if (Date.now() > confirmData.expiresAt) {
            this.pendingConfirmations.delete(confirmationId);
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

        // Update to executing
        const executingEmbed = EmbedBuilder.from(originalEmbed)
            .setColor(Colors.Yellow)
            .setTitle('⚙️ Executing...')
            .setFooter({ text: 'Running action...' });

        await interaction.update({ embeds: [executingEmbed], components: [] });

        try {
            // Execute the pre-generated code
            console.log('⚙️ Executing code...');
            const result = await this.executeCode(confirmData.code, confirmData.message);

            // Update confirmation to completed
            const completedEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(Colors.Green)
                .setTitle('✅ Action Completed')
                .setFooter({ text: 'Execution finished' });

            await interaction.editReply({ embeds: [completedEmbed] });

            // Send results
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
                        outputEmbed.addFields(output.fields);
                    }

                    await confirmData.message.channel.send({ embeds: [outputEmbed] });
                }
            } else {
                const fallbackEmbed = new EmbedBuilder()
                    .setColor(Colors.Blue)
                    .setTitle('📊 Result')
                    .setDescription('Action completed.')
                    .setTimestamp();

                await confirmData.message.channel.send({ embeds: [fallbackEmbed] });
            }

        } catch (error) {
            console.error('💥 Execution error:', error);
            const errorEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(Colors.Red)
                .setTitle('❌ Execution Failed')
                .setFooter({ text: 'Error occurred' });

            await interaction.editReply({ embeds: [errorEmbed] });

            const errorOutputEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ Error')
                .setDescription(error.message || 'Unknown error occurred')
                .setTimestamp();

            await confirmData.message.channel.send({ embeds: [errorOutputEmbed] });
        }
    }

    /**
     * Main process handler
     */
    async process(message, userMessage) {
        try {
            // Silent permission check - no response if failed
            if (!this.hasPermission(message.member, message.author.id)) {
                return { type: 'no_permission' };
            }

            // Send initial progress message
            const progressMsg = await message.reply({
                embeds: [new EmbedBuilder()
                    .setColor(Colors.Yellow)
                    .setTitle('⏳ Processing...')
                    .setDescription('Starting analysis...')
                    .setTimestamp()]
            });

            // Analyze, resolve, and generate code
            const { analysis, resolved, repliedData, code } = await this.analyzeAndPrepare(
                message,
                userMessage,
                progressMsg
            );

            // Delete progress message
            await progressMsg.delete();

            // Create confirmation with all info ready
            await this.createConfirmation(message, analysis, resolved, repliedData, code);

            return { type: 'confirmation_created' };

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