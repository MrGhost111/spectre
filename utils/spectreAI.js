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
     * Enhanced entity resolution with better AI analysis
     */
    async resolveEntities(analysis, message, repliedData) {
        const resolved = {
            users: [],
            roles: [],
            channels: [],
            categories: []
        };

        console.log('🔍 Resolving entities from analysis:', analysis.entities);

        // Handle context-based entities first
        if (analysis.usesContext) {
            if (analysis.usesContext.currentChannel) {
                console.log('📝 Adding current channel to resolved entities');
                resolved.channels.push(message.channel);
            }
            if (analysis.usesContext.currentCategory && message.channel.parent) {
                console.log('📝 Adding current category to resolved entities');
                resolved.categories.push(message.channel.parent);
            }
            if (analysis.usesContext.messageAuthor) {
                console.log('📝 Adding message author to resolved entities');
                resolved.users.push(message.author);
            }
            if (analysis.usesContext.repliedUser && repliedData) {
                console.log('📝 Adding replied user to resolved entities');
                if (!resolved.users.find(u => u.id === repliedData.author.id)) {
                    resolved.users.push(repliedData.author);
                }
            }
        }

        // Enhanced entity resolution using entityResolver
        if (analysis.entities.users && analysis.entities.users.length > 0) {
            console.log(`👥 Resolving users: ${analysis.entities.users.join(', ')}`);
            for (const userName of analysis.entities.users) {
                try {
                    const user = await this.entityResolver.findUser(userName, message.guild);
                    if (user) {
                        if (!resolved.users.find(u => u.id === user.id)) {
                            console.log(`✅ Resolved user: ${userName} -> ${user.username}`);
                            resolved.users.push(user);
                        }
                    } else {
                        console.log(`❌ Could not resolve user: ${userName}`);
                    }
                } catch (error) {
                    console.error(`Error resolving user ${userName}:`, error);
                }
            }
        }

        if (analysis.entities.roles && analysis.entities.roles.length > 0) {
            console.log(`🎭 Resolving roles: ${analysis.entities.roles.join(', ')}`);
            for (const roleName of analysis.entities.roles) {
                try {
                    const role = this.entityResolver.findRole(roleName, message.guild);
                    if (role) {
                        if (!resolved.roles.find(r => r.id === role.id)) {
                            console.log(`✅ Resolved role: ${roleName} -> ${role.name}`);
                            resolved.roles.push(role);
                        }
                    } else {
                        console.log(`❌ Could not resolve role: ${roleName}`);
                    }
                } catch (error) {
                    console.error(`Error resolving role ${roleName}:`, error);
                }
            }
        }

        if (analysis.entities.channels && analysis.entities.channels.length > 0) {
            console.log(`📝 Resolving channels: ${analysis.entities.channels.join(', ')}`);
            for (const channelName of analysis.entities.channels) {
                try {
                    const channel = this.entityResolver.findChannel(channelName, message.guild);
                    if (channel) {
                        if (!resolved.channels.find(c => c.id === channel.id)) {
                            console.log(`✅ Resolved channel: ${channelName} -> ${channel.name}`);
                            resolved.channels.push(channel);
                        }
                    } else {
                        console.log(`❌ Could not resolve channel: ${channelName}`);
                    }
                } catch (error) {
                    console.error(`Error resolving channel ${channelName}:`, error);
                }
            }
        }

        if (analysis.entities.categories && analysis.entities.categories.length > 0) {
            console.log(`📁 Resolving categories: ${analysis.entities.categories.join(', ')}`);
            for (const categoryName of analysis.entities.categories) {
                try {
                    const category = this.entityResolver.findCategory(categoryName, message.guild);
                    if (category) {
                        if (!resolved.categories.find(c => c.id === category.id)) {
                            console.log(`✅ Resolved category: ${categoryName} -> ${category.name}`);
                            resolved.categories.push(category);
                        }
                    } else {
                        console.log(`❌ Could not resolve category: ${categoryName}`);
                    }
                } catch (error) {
                    console.error(`Error resolving category ${categoryName}:`, error);
                }
            }
        }

        // Check mentions in original message
        if (message.mentions.users.size > 0) {
            console.log('👥 Adding mentioned users');
            message.mentions.users.forEach(user => {
                if (!resolved.users.find(u => u.id === user.id)) {
                    resolved.users.push(user);
                }
            });
        }

        if (message.mentions.roles.size > 0) {
            console.log('🎭 Adding mentioned roles');
            message.mentions.roles.forEach(role => {
                if (!resolved.roles.find(r => r.id === role.id)) {
                    resolved.roles.push(role);
                }
            });
        }

        if (message.mentions.channels.size > 0) {
            console.log('📝 Adding mentioned channels');
            message.mentions.channels.forEach(channel => {
                if (!resolved.channels.find(c => c.id === channel.id)) {
                    resolved.channels.push(channel);
                }
            });
        }

        console.log('✅ Final resolved entities:', {
            users: resolved.users.map(u => u.username),
            roles: resolved.roles.map(r => r.name),
            channels: resolved.channels.map(c => c.name),
            categories: resolved.categories.map(c => c.name)
        });

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

CRITICAL REQUIREMENTS FOR RESULTS:
1. ALWAYS return meaningful results that show WHAT actually happened
2. For channel operations: include channel mentions <#channelId>
3. For user operations: include user mentions <@userId> 
4. For role operations: include role mentions <@&roleId>
5. Show actual data that was processed, not just "success"
6. Include counts, names, and specific outcomes
7. If fetching data, show the actual data retrieved
8. If modifying something, show before/after states
9. Use ONLY Discord.js v14+ syntax
10. Use PermissionFlagsBits for permissions
11. Use ChannelType enum for channel types
12. Return: { success: boolean, results: Array<{title: string, description: string, fields?: Array}> }
13. ALL OUTPUT MUST BE IN EMBEDS - results array will be used to create multiple embeds
14. Mentions in embeds DON'T PING - use <@userId>, <@&roleId>, <#channelId> freely
15. Handle large data by splitting:
    - If description > 4000 chars, split into multiple result objects
    - If field value > 1024 chars, split into multiple fields
    - If total fields > 25, split into multiple embeds
16. For operations on >100 items, process in batches of 100
17. NEVER send plain text messages - only embeds via results array
18. Handle ALL errors gracefully with try-catch
19. Use Colors from discord.js for embed colors

RESOLVED ENTITIES TO USE IN CODE:
- Users: ${resolved.users.map(u => `${u.username} (ID: ${u.id})`).join(', ') || 'none'}
- Roles: ${resolved.roles.map(r => `${r.name} (ID: ${r.id})`).join(', ') || 'none'}
- Channels: ${resolved.channels.map(c => `${c.name} (ID: ${c.id})`).join(', ') || 'none'}
- Categories: ${resolved.categories.map(c => `${c.name} (ID: ${c.id})`).join(', ') || 'none'}

Example for banning a user:
\`\`\`javascript
(async () => {
    try {
        const targetUser = guild.members.cache.get('${resolved.users[0]?.id || 'USER_ID'}');
        if (!targetUser) {
            return {
                success: false,
                results: [{
                    title: '❌ User Not Found',
                    description: 'Could not find the specified user.'
                }]
            };
        }

        await targetUser.ban({ reason: 'Banned by SpectreAI' });
        
        return {
            success: true,
            results: [{
                title: '✅ User Banned',
                description: \`Successfully banned <@\${targetUser.id}> (\${targetUser.user.username})\`,
                fields: [
                    { name: 'User ID', value: targetUser.id, inline: true },
                    { name: 'Username', value: targetUser.user.tag, inline: true }
                ]
            }]
        };
    } catch (error) {
        return {
            success: false,
            results: [{
                title: '❌ Ban Failed',
                description: \`Failed to ban user: \${error.message}\`
            }]
        };
    }
})();
\`\`\`

Example for listing current channel:
\`\`\`javascript
(async () => {
    try {
        const channel = message.channel;
        return {
            success: true,
            results: [{
                title: '📊 Current Channel Info',
                description: \`**Channel:** <#\${channel.id}>\\n**Name:** \${channel.name}\\n**ID:** \${channel.id}\\n**Category:** \${channel.parent ? channel.parent.name : 'None'}\`,
                fields: [
                    { name: 'Type', value: channel.type.toString(), inline: true },
                    { name: 'Created', value: \`<t:\${Math.floor(channel.createdTimestamp / 1000)}:R>\`, inline: true },
                    { name: 'Position', value: channel.position.toString(), inline: true }
                ]
            }]
        };
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

Action: ${analysis.action}
Description: ${analysis.description}

Parameters: ${JSON.stringify(analysis.parameters)}

${repliedData ? `Replied Message Data:
- Content: ${repliedData.content}
- Embeds: ${JSON.stringify(repliedData.embeds)}` : ''}

Context:
- Message Channel ID: ${message.channel.id}
- Message Guild ID: ${message.guild.id}
- Message Author ID: ${message.author.id}

Generate the code now. Use the RESOLVED ENTITIES above in your code:`;

        try {
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    { role: "system", content: "You are a Discord.js v14 code generator. Generate only executable JavaScript code with proper error handling and meaningful results that show actual data. Use the resolved entities provided in the prompt." },
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
            // Pre-require all necessary modules and make them available
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

            // Create a safe execution environment with all required modules
            const executionContext = {
                // Discord.js modules
                PermissionFlagsBits,
                ChannelType,
                EmbedBuilder,
                Colors,

                // Discord objects
                message,
                guild,
                client,
                channel,

                // Node.js globals (safe ones)
                console,
                setTimeout,
                setInterval,
                clearTimeout,
                clearInterval,
                Promise,
                Date,
                JSON,
                Math,

                // Make require available for the AI code
                require
            };

            // Wrap in async function with proper return and error handling
            const wrappedCode = `
                try {
                    ${cleanCode}
                } catch (error) {
                    return {
                        success: false,
                        results: [{
                            title: '❌ Execution Error',
                            description: 'Error: ' + error.message
                        }]
                    };
                }
            `;

            const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;

            // Pass all context variables to the function
            const executor = new AsyncFunction(
                ...Object.keys(executionContext),
                `return (async () => { ${wrappedCode} })();`
            );

            // Execute with all context
            const result = await executor(...Object.values(executionContext));
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
     * Enhanced analysis with better entity extraction
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

CRITICAL CONTEXT RULES:
- "this channel" / "here" = current channel (${message.channel.name})
- "this category" = current category (${message.channel.parent?.name || 'none'})
- "this user" (when replying) = the user being replied to
- "this message" (when replying) = the message being replied to
- "me" / "my" = the command author (${message.author.username})
- Specific names like "def bot", "wolfy", "admin role" = search for those exact entities

PRONOUN AND CONTEXT ANALYSIS:
- If user says "ban def bot", target user named "def bot", NOT the message author
- If user says "give me admin", target the message author (${message.author.username})
- If user says "delete general channel", target channel named "general"
- If replying and says "ban this user", target the replied user (${repliedData?.author.username || 'N/A'})
- If user mentions a specific name, ALWAYS include it in entities

Discord Entities:
- Users: Members (mentioned with @username or by name like "def bot")
- Roles: Permission groups (@rolename or by name like "admin role")
- Channels: Text/voice channels (#channel or by name like "general")
- Categories: Groups of channels

Your Task:
1. Identify the ACTION (what to do)
2. Identify TARGET entities (users, roles, channels, categories) - be specific about names mentioned
3. Extract PARAMETERS (names, values, settings)
4. Describe DETAILED STEPS of execution (be specific about what will happen)
5. Understand context correctly - don't confuse subjects

Respond with ONLY valid JSON:
{
  "action": "descriptive_action_name",
  "description": "Brief human readable description",
  "detailedSteps": [
    "Step 1: Specific action (e.g., 'Search for user named def bot using entity resolver')",
    "Step 2: Another action (e.g., 'Ban the user if found')",
    "Step 3: Final step (e.g., 'Send result embed with ban confirmation')"
  ],
  "entities": {
    "users": ["username1", "def bot", "wolfy"],
    "roles": ["rolename1", "admin role"],
    "channels": ["channelname1", "general"],
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
                    { role: "system", content: "You are a Discord action analyzer. Respond only with valid JSON. Be careful with context and don't confuse subjects. Always extract specific entity names mentioned in the user message." },
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
            console.log('🔍 AI Analysis Result:', JSON.stringify(analysis, null, 2));

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

        // Show affected entities with proper mentions
        if (resolved.users.length > 0) {
            const userList = resolved.users.map(u => `• <@${u.id}> (${u.username})`).join('\n');
            embed.addFields({
                name: '👥 Target Users',
                value: this.truncateText(userList, 1024),
                inline: true
            });
        }

        if (resolved.roles.length > 0) {
            const roleList = resolved.roles.map(r => `• <@&${r.id}> (${r.name})`).join('\n');
            embed.addFields({
                name: '🎭 Target Roles',
                value: this.truncateText(roleList, 1024),
                inline: true
            });
        }

        if (resolved.channels.length > 0) {
            const channelList = resolved.channels.map(c => `• <#${c.id}> (${c.name})`).join('\n');
            embed.addFields({
                name: '📝 Target Channels',
                value: this.truncateText(channelList, 1024),
                inline: true
            });
        }

        if (resolved.categories.length > 0) {
            const catList = resolved.categories.map(c => `• ${c.name} (ID: ${c.id})`).join('\n');
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
     * Helper: Split array into chunks
     */
    chunkArray(array, chunkSize) {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
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

            console.log('📊 Execution result:', JSON.stringify(result, null, 2));

            // Update confirmation to completed
            const completedEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(result.success ? Colors.Green : Colors.Red)
                .setTitle(result.success ? '✅ Action Completed' : '❌ Action Failed')
                .setFooter({ text: result.success ? 'Execution finished' : 'Execution failed' });

            await interaction.editReply({ embeds: [completedEmbed] });

            // Send results - FIXED: Check if results exist and handle them properly
            if (result && result.results && Array.isArray(result.results) && result.results.length > 0) {
                console.log(`📨 Sending ${result.results.length} result embeds`);

                for (const output of result.results) {
                    try {
                        const outputEmbed = new EmbedBuilder()
                            .setColor(result.success ? Colors.Green : Colors.Red)
                            .setTitle(output.title || (result.success ? '📊 Result' : '❌ Error'))
                            .setTimestamp();

                        if (output.description) {
                            outputEmbed.setDescription(output.description);
                        }

                        if (output.fields && Array.isArray(output.fields) && output.fields.length > 0) {
                            // Add fields in chunks of 25 (Discord limit)
                            const fieldChunks = this.chunkArray(output.fields, 25);
                            for (const fields of fieldChunks) {
                                const chunkEmbed = new EmbedBuilder(outputEmbed.toJSON());
                                chunkEmbed.addFields(fields);
                                await confirmData.message.channel.send({ embeds: [chunkEmbed] });
                            }
                        } else {
                            // Only send if there's actual content
                            if (output.description || output.title) {
                                await confirmData.message.channel.send({ embeds: [outputEmbed] });
                            }
                        }
                    } catch (embedError) {
                        console.error('Error sending result embed:', embedError);
                        // Send fallback error
                        const errorEmbed = new EmbedBuilder()
                            .setColor(Colors.Red)
                            .setTitle('❌ Error Displaying Results')
                            .setDescription('Failed to display action results.')
                            .setTimestamp();
                        await confirmData.message.channel.send({ embeds: [errorEmbed] });
                    }
                }
            } else {
                console.log('⚠️ No results array found in execution result');
                // If no results but execution was successful, create a default success message
                if (result && result.success) {
                    const successEmbed = new EmbedBuilder()
                        .setColor(Colors.Green)
                        .setTitle('✅ Action Completed')
                        .setDescription('The action was executed successfully.')
                        .setTimestamp();
                    await confirmData.message.channel.send({ embeds: [successEmbed] });
                } else {
                    // Execution failed but no results provided
                    const errorEmbed = new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setTitle('❌ Execution Failed')
                        .setDescription('The action failed but no error details were provided.')
                        .setTimestamp();
                    await confirmData.message.channel.send({ embeds: [errorEmbed] });
                }
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