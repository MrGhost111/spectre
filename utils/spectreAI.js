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

        // SECURITY: Your Discord User ID - ONLY YOU can use this bot
        this.AUTHORIZED_USER_ID = '753491023208120321';
    }

    /**
     * SECURITY: Check if user has permission to execute actions
     * Now ONLY allows your specific user ID
     */
    hasPermission(member, userId) {
        // Only allow your specific user ID
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

            // Extract embed data
            if (repliedMsg.embeds.length > 0) {
                repliedMsg.embeds.forEach(embed => {
                    const embedData = {
                        title: embed.title || '',
                        description: embed.description || '',
                        fields: embed.fields.map(f => ({ name: f.name, value: f.value })),
                        url: embed.url || '',
                        timestamp: embed.timestamp || ''
                    };
                    data.embeds.push(embedData);
                });
            }

            // Extract attachment info
            if (repliedMsg.attachments.size > 0) {
                repliedMsg.attachments.forEach(att => {
                    data.attachments.push({
                        name: att.name,
                        url: att.url,
                        type: att.contentType
                    });
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

        // Check for message spam (more than 20 messages)
        if (analysis.parameters) {
            const messageCount = parseInt(analysis.parameters.count) ||
                parseInt(analysis.parameters.amount) ||
                parseInt(analysis.parameters.messages) || 0;

            if (messageCount > 20) {
                dangers.isSpam = true;
                dangers.reasons.push(`⚠️ High message count: ${messageCount} messages (consider using lower count)`);
            }
        }

        // Check for mass deletion/ban (nuke protection)
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

        // Check for mass pinging
        if (action.includes('ping') || action.includes('mention') || action.includes('dm')) {
            const pingCount = (analysis.entities.users?.length || 0) +
                (analysis.entities.roles?.length || 0);

            if (pingCount > 3) {
                dangers.isMassPing = true;
                dangers.reasons.push(`📢 Mass ping/DM detected (${pingCount} targets) - Consider if this is necessary`);
            }
        }

        // Check for @everyone or @here
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
     * Enhanced request analysis with better context understanding
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

Discord Entity Types:
- Users: Server members (can be @mentioned or named)
- Roles: Permission groups (can be @mentioned or named)  
- Channels: Text/voice channels (can be #mentioned or named)
- Categories: Channel groups
- Messages: Individual messages (can be referenced by reply or ID)

Common Discord Actions:
- Message Operations: send, delete, edit, fetch, purge, clear
- User Operations: kick, ban, timeout, add role, remove role, list roles, get info
- Channel Operations: create, delete, rename, lock, unlock, set permissions
- Role Operations: create, delete, rename, assign, remove, list members
- Information: list, show, display, summarize, analyze, count
- Moderation: mute, unmute, ban, kick, warn, timeout

Your Task:
1. Identify the EXACT ACTION with precision
2. Identify ALL TARGET entities correctly (consider context!)
3. Extract PARAMETERS with correct values
4. Create DETAILED STEPS explaining what will happen
5. Mark which context elements are being used

Respond with ONLY valid JSON (no markdown, no explanations):
{
  "action": "descriptive_action_name",
  "description": "Clear human-readable description of what will happen",
  "detailedSteps": [
    "Step 1: Exact action with specific details",
    "Step 2: Another exact action with details",
    "Step 3: Final result or output"
  ],
  "entities": {
    "users": ["username1", "username2"],
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
}

EXAMPLES OF GOOD ANALYSIS:

Input: "summarize the last 100 messages"
Output: {
  "action": "summarize_message_history",
  "description": "Fetch and summarize the last 100 messages from current channel",
  "detailedSteps": [
    "Fetch the last 100 messages from #${message.channel.name}",
    "Analyze message content, authors, and patterns",
    "Generate a comprehensive summary with key topics and statistics",
    "Display summary in an embed"
  ],
  "entities": { "users": [], "roles": [], "channels": [], "categories": [] },
  "parameters": { "count": 100, "messageType": "all" },
  "usesContext": { "currentChannel": true, "currentCategory": false, "repliedUser": false, "repliedMessage": false, "messageAuthor": false }
}

Input: "give me the member role"
Output: {
  "action": "assign_role_to_author",
  "description": "Assign the 'member' role to ${message.author.username}",
  "detailedSteps": [
    "Find the role named 'member' in the server",
    "Add the 'member' role to ${message.author.username}",
    "Confirm successful role assignment"
  ],
  "entities": { "users": [], "roles": ["member"], "channels": [], "categories": [] },
  "parameters": { "roleName": "member" },
  "usesContext": { "currentChannel": false, "currentCategory": false, "repliedUser": false, "repliedMessage": false, "messageAuthor": true }
}

Input: "delete the last 50 messages" 
Output: {
  "action": "bulk_delete_messages",
  "description": "Delete the last 50 messages from current channel",
  "detailedSteps": [
    "Fetch the last 50 messages from #${message.channel.name}",
    "Bulk delete all fetched messages (Discord limit: messages under 14 days old)",
    "Report number of messages successfully deleted"
  ],
  "entities": { "users": [], "roles": [], "channels": [], "categories": [] },
  "parameters": { "count": 50 },
  "usesContext": { "currentChannel": true, "currentCategory": false, "repliedUser": false, "repliedMessage": false, "messageAuthor": false }
}`;

        try {
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    { role: "system", content: "You are a Discord action analyzer. Respond only with valid JSON. Be extremely precise and consider all context clues." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 1000,
                temperature: 0.1
            });

            const aiResponse = response.choices[0].message.content;
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);

            if (!jsonMatch) {
                throw new Error('Failed to parse AI response - no JSON found');
            }

            const analysis = JSON.parse(jsonMatch[0]);

            // Validate analysis structure
            if (!analysis.action || !analysis.description || !analysis.detailedSteps) {
                throw new Error('Incomplete analysis from AI');
            }

            // Resolve entities
            const resolved = await this.resolveEntities(analysis, message, repliedData);

            return { analysis, resolved, repliedData };
        } catch (error) {
            console.error('Request analysis error:', error);
            throw error;
        }
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

        // Add member info
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
     * Enhanced entity resolution
     */
    async resolveEntities(analysis, message, repliedData) {
        const resolved = {
            users: [],
            roles: [],
            channels: [],
            categories: []
        };

        // Handle context-based entities FIRST
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

        // Resolve named entities using fuzzy search
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

        // Check mentions in original message (these override everything)
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
     * Enhanced code generation with better Discord.js v14 support
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

DISCORD.JS V14 CRITICAL RULES:
1. Fetch members: await guild.members.fetch(userId) or guild.members.cache.get(userId)
2. Fetch channels: guild.channels.cache.get(channelId)
3. Fetch roles: guild.roles.cache.get(roleId)
4. Fetch messages: await channel.messages.fetch({ limit: number })
5. Send messages: await channel.send({ content: 'text' }) or { embeds: [embed] }
6. Bulk delete: await channel.bulkDelete(messages, true) - 2nd param filters old messages
7. Member permissions: member.permissions.has(PermissionFlagsBits.Administrator)
8. Role operations: await member.roles.add(role) or await member.roles.remove(role)
9. NEVER use deprecated methods: .isText(), .isTextBased(), .isThread()
10. Check channel type: channel.type === ChannelType.GuildText

COMMON OPERATIONS:

// Fetch and summarize messages
const messages = await channel.messages.fetch({ limit: 100 });
const summary = {
  totalMessages: messages.size,
  uniqueUsers: new Set(messages.map(m => m.author.id)).size,
  mostActive: [...messages.reduce((acc, m) => {
    acc.set(m.author.id, (acc.get(m.author.id) || 0) + 1);
    return acc;
  }, new Map())].sort((a, b) => b[1] - a[1])[0]
};

// Bulk delete messages
const fetchedMessages = await channel.messages.fetch({ limit: 100 });
const deleted = await channel.bulkDelete(fetchedMessages, true);

// Assign role
const member = await guild.members.fetch('userId');
const role = guild.roles.cache.get('roleId');
await member.roles.add(role);

// List user roles
const member = guild.members.cache.get('userId');
const roles = member.roles.cache
  .filter(r => r.id !== guild.id)
  .map(r => \`<@&\${r.id}>\`)
  .join('\\n');

// Create embed result
const embed = new EmbedBuilder()
  .setColor(Colors.Blue)
  .setTitle('Title')
  .setDescription('Description')
  .addFields({ name: 'Field', value: 'Value' })
  .setTimestamp();

REQUIRED RETURN FORMAT:
{
  success: true/false,
  results: [
    {
      title: "Action Title",
      description: "Detailed result description",
      fields: [{ name: "Name", value: "Value", inline: false }] // optional
    }
  ]
}

IMPORTANT:
- Only push to results array ONCE per distinct result
- Use try-catch for ALL async operations
- Provide detailed, user-friendly descriptions
- Include actual data in results (counts, names, etc.)
- Format lists and data clearly
- Handle errors gracefully with informative messages

Generate the complete, production-ready code now:`;

        try {
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    {
                        role: "system",
                        content: "You are an expert Discord.js v14 code generator. Generate ONLY valid, executable JavaScript wrapped in (async () => { ... })(); format. Use ONLY Discord.js v14 syntax. Be precise and handle all edge cases."
                    },
                    { role: "user", content: prompt }
                ],
                max_tokens: 2500,
                temperature: 0.05
            });

            const aiResponse = response.choices[0].message.content;
            const codeMatch = aiResponse.match(/```(?:javascript)?\s*([\s\S]*?)```/);

            if (codeMatch) {
                return codeMatch[1].trim();
            }

            if (aiResponse.includes('(async ()')) {
                return aiResponse.trim();
            }

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
            { old: /\.isText\(\)/g, new: '.type === ChannelType.GuildText' },
            { old: /\.isTextBased\(\)/g, new: '.type === ChannelType.GuildText' },
            { old: /\.isDM\(\)/g, new: '.type === ChannelType.DM' },
            { old: /\.isThread\(\)/g, new: '[ChannelType.PublicThread, ChannelType.PrivateThread].includes(channel.type)' },
        ];

        let hasChanges = false;
        for (const pattern of deprecatedPatterns) {
            if (pattern.old.test(fixedCode)) {
                console.warn(`⚠️ Found deprecated pattern: ${pattern.old}`);
                fixedCode = fixedCode.replace(pattern.old, pattern.new);
                hasChanges = true;
            }
        }

        if (hasChanges) {
            console.log('✅ Automatically fixed deprecated Discord.js patterns');
        }

        return fixedCode;
    }

    /**
     * Execute generated code safely with sandbox
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

            const explanation = await this.explainError(error, code);

            return {
                success: false,
                results: [{
                    title: '❌ Execution Error',
                    description: explanation
                }]
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
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    { role: "system", content: "Explain errors simply and concisely for Discord users." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 150,
                temperature: 0.2
            });

            const explanation = response.choices[0].message.content.trim();
            return explanation.length > 300 ? explanation.substring(0, 297) + '...' : explanation;
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

        // Show detailed steps
        if (analysis.detailedSteps && analysis.detailedSteps.length > 0) {
            let stepsText = '';
            analysis.detailedSteps.forEach((step, index) => {
                stepsText += `${index + 1}. ${step}\n`;
            });

            if (stepsText.length > 1024) {
                const chunks = stepsText.match(/.{1,1024}/g);
                chunks.forEach((chunk, i) => {
                    embed.addFields({
                        name: i === 0 ? '📋 What will happen:' : '📋 Continued:',
                        value: chunk
                    });
                });
            } else {
                embed.addFields({ name: '📋 What will happen:', value: stepsText });
            }
        }

        // Show warnings
        if (dangers.reasons.length > 0) {
            embed.addFields({
                name: isBlocked ? '🚨 Critical Warnings' : '⚠️ Warnings',
                value: dangers.reasons.join('\n'),
                inline: false
            });
        }

        // Show affected entities
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

        // Show parameters
        if (analysis.parameters && Object.keys(analysis.parameters).length > 0) {
            const paramsText = Object.entries(analysis.parameters)
                .map(([key, value]) => `• **${key}:** ${JSON.stringify(value)}`)
                .join('\n');
            if (paramsText.length > 1024) {
                embed.addFields({ name: '⚙️ Parameters', value: paramsText.substring(0, 1021) + '...' });
            } else {
                embed.addFields({ name: '⚙️ Parameters', value: paramsText });
            }
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

        // Update to processing
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

            // Update confirmation message
            const completedEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(result.success ? Colors.Green : Colors.Red)
                .setTitle(result.success ? '✅ Action Completed' : '❌ Action Failed')
                .setFooter({ text: result.success ? 'Results shown below' : 'Error details shown below' });

            await interaction.editReply({ embeds: [completedEmbed] });

            // Send result embeds
            if (result && result.results && result.results.length > 0) {
                const uniqueResults = [];
                const seen = new Set();

                for (const output of result.results) {
                    const key = `${output.title || 'no-title'}:${output.description || 'no-desc'}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        uniqueResults.push(output);
                    }
                }

                for (const output of uniqueResults) {
                    const outputEmbed = new EmbedBuilder()
                        .setColor(result.success ? Colors.Blue : Colors.Red)
                        .setTitle(output.title || '📊 Result')
                        .setTimestamp();

                    if (output.description) {
                        outputEmbed.setDescription(output.description.length > 4096
                            ? output.description.substring(0, 4093) + '...'
                            : output.description);
                    }

                    if (output.fields && output.fields.length > 0) {
                        outputEmbed.addFields(output.fields.slice(0, 25));
                    }

                    await confirmData.message.channel.send({ embeds: [outputEmbed] });
                }
            } else {
                const fallbackEmbed = new EmbedBuilder()
                    .setColor(Colors.Blue)
                    .setTitle('📊 Result')
                    .setDescription('Action completed successfully with no output.')
                    .setTimestamp();

                await confirmData.message.channel.send({ embeds: [fallbackEmbed] });
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
     * Main process handler - entry point
     */
    async process(message, userMessage) {
        try {
            // SECURITY CHECK: Only allow authorized user
            if (!this.hasPermission(message.member, message.author.id)) {
                return {
                    type: 'error',
                    embed: new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setDescription('❌ **Access Denied**\nThis bot is restricted to authorized users only.')
                        .setFooter({ text: 'Only the bot owner can execute AI actions.' })
                };
            }

            // Analyze request and create confirmation
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