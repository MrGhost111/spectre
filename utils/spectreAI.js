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
     * Determine if request is chat or action
     */
    async detectIntent(userMessage) {
        const actionKeywords = [
            'create', 'delete', 'remove', 'add', 'move', 'ban', 'kick', 'mute', 'unmute',
            'give', 'take', 'assign', 'revoke', 'set', 'change', 'edit', 'update',
            'lock', 'unlock', 'hide', 'show', 'rename', 'send', 'dm', 'purge', 'clear'
        ];

        const hasActionKeyword = actionKeywords.some(keyword => 
            userMessage.toLowerCase().includes(keyword)
        );

        if (hasActionKeyword) {
            return 'action';
        }

        const prompt = `Determine if this Discord message is asking the bot to perform an action or just casual chat.

Message: "${userMessage}"

Action examples:
- "move this channel to top"
- "create a role called admin"
- "ban this user"
- "send a message in general"

Chat examples:
- "how are you"
- "what's the weather"
- "tell me a joke"

Respond with ONLY: action OR chat`;

        try {
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    { role: "system", content: "You are an intent classifier. Respond with only 'action' or 'chat'." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 10,
                temperature: 0.1
            });

            const result = response.choices[0].message.content.toLowerCase().trim();
            return result.includes('action') ? 'action' : 'chat';
        } catch (error) {
            console.error('Intent detection error:', error);
            return 'chat';
        }
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
     * Analyze the request and extract what needs to be done
     */
    async analyzeRequest(message, userMessage) {
        const contextInfo = this.buildContextInfo(message);

        const prompt = `You are a Discord action analyzer. Analyze what the user wants to do and extract all relevant information.

User Message: "${userMessage}"

Context:
${contextInfo}

Discord Entities Explained:
- Users: Members of the server (can be mentioned with @username or by name)
- Roles: Permission groups (can be mentioned with @rolename or by name)
- Channels: Text/voice channels (can be mentioned with #channel or by name)
- Categories: Groups of channels

Common Pronouns:
- "this channel" = the channel the message was sent in
- "this category" = the category containing the current channel
- "this user" = the user being replied to (if replying)
- "here" = current channel/location

Your Task:
1. Identify the ACTION (what to do)
2. Identify TARGET entities (users, roles, channels, categories)
3. Extract any PARAMETERS (names, values, settings)

Respond with ONLY valid JSON:
{
  "action": "descriptive action like 'create_channel', 'ban_user', 'move_channel'",
  "description": "human readable description of what will happen",
  "entities": {
    "users": ["username1", "username2"],
    "roles": ["rolename1"],
    "channels": ["channelname1"],
    "categories": ["categoryname1"]
  },
  "parameters": {
    "name": "value",
    "setting": "value"
  },
  "usesContext": {
    "currentChannel": true/false,
    "currentCategory": true/false,
    "repliedUser": true/false,
    "repliedMessage": true/false
  },
  "requiresConfirmation": true/false
}

Examples:
"create a channel called test in this category" →
{
  "action": "create_channel",
  "description": "Create a text channel named 'test' in the current category",
  "entities": {},
  "parameters": {"name": "test", "type": "text"},
  "usesContext": {"currentCategory": true},
  "requiresConfirmation": false
}

"ban faiz" →
{
  "action": "ban_user",
  "description": "Ban user faiz from the server",
  "entities": {"users": ["faiz"]},
  "parameters": {},
  "usesContext": {},
  "requiresConfirmation": true
}`;

        try {
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    { role: "system", content: "You are a Discord action analyzer. Respond only with valid JSON." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 500,
                temperature: 0.2
            });

            const aiResponse = response.choices[0].message.content;
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            throw new Error('Failed to parse AI response');
        } catch (error) {
            console.error('Request analysis error:', error);
            throw error;
        }
    }

    /**
     * Build context information about the message
     */
    buildContextInfo(message) {
        let context = `- Current Channel: #${message.channel.name} (ID: ${message.channel.id})`;
        
        if (message.channel.parent) {
            context += `\n- Current Category: ${message.channel.parent.name} (ID: ${message.channel.parent.id})`;
        }

        if (message.reference) {
            context += `\n- User is replying to a message`;
        }

        return context;
    }

    /**
     * Resolve entity names to actual Discord objects
     */
    async resolveEntities(analysis, message) {
        const resolved = {
            users: [],
            roles: [],
            channels: [],
            categories: []
        };

        // Handle context-based entities
        if (analysis.usesContext) {
            if (analysis.usesContext.currentChannel) {
                resolved.channels.push(message.channel);
            }
            if (analysis.usesContext.currentCategory && message.channel.parent) {
                resolved.categories.push(message.channel.parent);
            }
            if (analysis.usesContext.repliedUser && message.reference) {
                try {
                    const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
                    resolved.users.push(repliedMsg.author);
                } catch (error) {
                    console.error('Failed to fetch replied message');
                }
            }
        }

        // Resolve entity names using fuzzy search
        if (analysis.entities.users) {
            for (const userName of analysis.entities.users) {
                const user = await this.entityResolver.findUser(userName, message.guild);
                if (user) resolved.users.push(user);
            }
        }

        if (analysis.entities.roles) {
            for (const roleName of analysis.entities.roles) {
                const role = this.entityResolver.findRole(roleName, message.guild);
                if (role) resolved.roles.push(role);
            }
        }

        if (analysis.entities.channels) {
            for (const channelName of analysis.entities.channels) {
                const channel = this.entityResolver.findChannel(channelName, message.guild);
                if (channel) resolved.channels.push(channel);
            }
        }

        if (analysis.entities.categories) {
            for (const categoryName of analysis.entities.categories) {
                const category = this.entityResolver.findCategory(categoryName, message.guild);
                if (category) resolved.categories.push(category);
            }
        }

        // Also check for mentions in the original message
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
     * Generate Discord.js v14 code to execute the action
     */
    async generateCode(analysis, resolved, message) {
        const prompt = `Generate Discord.js v14 code to perform this action.

Action: ${analysis.action}
Description: ${analysis.description}

Resolved Entities:
- Users: ${resolved.users.map(u => `${u.username} (ID: ${u.id})`).join(', ') || 'none'}
- Roles: ${resolved.roles.map(r => `${r.name} (ID: ${r.id})`).join(', ') || 'none'}
- Channels: ${resolved.channels.map(c => `${c.name} (ID: ${c.id})`).join(', ') || 'none'}
- Categories: ${resolved.categories.map(c => `${c.name} (ID: ${c.id})`).join(', ') || 'none'}

Parameters: ${JSON.stringify(analysis.parameters)}

Context:
- Message Channel ID: ${message.channel.id}
- Message Guild ID: ${message.guild.id}
- Message Author ID: ${message.author.id}

CRITICAL REQUIREMENTS:
1. Use ONLY Discord.js v14+ syntax
2. Use PermissionFlagsBits for permissions (not PermissionsBitField.Flags)
3. Use ChannelType enum for channel types
4. All async operations must use await
5. Return an object with: { success: boolean, message: string, data?: any }
6. Handle errors with try-catch
7. The code will have access to: message, guild, client objects
8. For channel creation, use: guild.channels.create({ name: 'name', type: ChannelType.GuildText })
9. For permissions, use: PermissionFlagsBits.Administrator

Code must be wrapped in an async IIFE that returns the result object.

Example format:
\`\`\`javascript
(async () => {
    try {
        // Your code here
        const result = await someAction();
        return { success: true, message: "Action completed", data: result };
    } catch (error) {
        return { success: false, message: error.message };
    }
})();
\`\`\`

Generate the code now:`;

        try {
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    { role: "system", content: "You are a Discord.js v14 code generator. Generate only executable JavaScript code." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 1000,
                temperature: 0.3
            });

            const aiResponse = response.choices[0].message.content;
            const codeMatch = aiResponse.match(/```(?:javascript)?\s*([\s\S]*?)```/);
            
            if (codeMatch) {
                return codeMatch[1].trim();
            }

            // If no code blocks, try to extract IIFE
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
            const { PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
            const guild = message.guild;
            const client = message.client;
            const channel = message.channel;
            
            // Execute the code
            const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
            const executor = new AsyncFunction('message', 'guild', 'client', 'channel', 'PermissionFlagsBits', 'ChannelType', 'EmbedBuilder', `return ${code}`);
            
            const result = await executor(message, guild, client, channel, PermissionFlagsBits, ChannelType, EmbedBuilder);
            return result;
        } catch (error) {
            console.error('Code execution error:', error);
            return {
                success: false,
                message: `Execution error: ${error.message}`
            };
        }
    }

    /**
     * Format the result message with proper mentions
     */
    formatResult(result, resolved) {
        let formattedMessage = result.message;

        // Replace entity references with mentions
        if (resolved.users.length > 0) {
            resolved.users.forEach(user => {
                formattedMessage = formattedMessage.replace(new RegExp(user.username, 'gi'), `<@${user.id}>`);
            });
        }

        if (resolved.roles.length > 0) {
            resolved.roles.forEach(role => {
                formattedMessage = formattedMessage.replace(new RegExp(role.name, 'gi'), `<@&${role.id}>`);
            });
        }

        if (resolved.channels.length > 0) {
            resolved.channels.forEach(channel => {
                formattedMessage = formattedMessage.replace(new RegExp(channel.name, 'gi'), `<#${channel.id}>`);
            });
        }

        return formattedMessage;
    }

    /**
     * Create confirmation prompt for destructive actions
     */
    async requestConfirmation(message, analysis, resolved) {
        const confirmationId = `confirm_${Date.now()}_${message.author.id}`;
        
        const embed = new EmbedBuilder()
            .setColor(Colors.Orange)
            .setTitle('⚠️ Confirmation Required')
            .setDescription(`**Action:** ${analysis.description}`)
            .setFooter({ text: 'This action requires confirmation. Click below to proceed or cancel.' });

        // Add details about what will be affected
        if (resolved.users.length > 0) {
            embed.addFields({ name: 'Users', value: resolved.users.map(u => `<@${u.id}>`).join(', '), inline: true });
        }
        if (resolved.roles.length > 0) {
            embed.addFields({ name: 'Roles', value: resolved.roles.map(r => `<@&${r.id}>`).join(', '), inline: true });
        }
        if (resolved.channels.length > 0) {
            embed.addFields({ name: 'Channels', value: resolved.channels.map(c => `<#${c.id}>`).join(', '), inline: true });
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`${confirmationId}_confirm`)
                    .setLabel('Confirm')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId(`${confirmationId}_cancel`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('❌')
            );

        const confirmMsg = await message.reply({ embeds: [embed], components: [row] });

        // Store confirmation data
        this.pendingConfirmations.set(confirmationId, {
            analysis,
            resolved,
            message,
            authorId: message.author.id,
            expiresAt: Date.now() + 60000 // 1 minute
        });

        // Auto-cleanup after 1 minute
        setTimeout(() => {
            if (this.pendingConfirmations.has(confirmationId)) {
                this.pendingConfirmations.delete(confirmationId);
                confirmMsg.edit({ components: [] }).catch(() => {});
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
            return interaction.reply({ content: '❌ This confirmation has expired.', ephemeral: true });
        }

        if (confirmData.authorId !== interaction.user.id) {
            return interaction.reply({ content: '❌ Only the person who initiated this action can confirm it.', ephemeral: true });
        }

        this.pendingConfirmations.delete(confirmationId);

        if (!confirmed) {
            await interaction.update({ content: '❌ Action cancelled.', embeds: [], components: [] });
            return;
        }

        // Proceed with action
        await interaction.update({ content: '⏳ Processing...', embeds: [], components: [] });

        try {
            const code = await this.generateCode(confirmData.analysis, confirmData.resolved, confirmData.message);
            const result = await this.executeCode(code, confirmData.message);

            if (result.success) {
                const formattedMessage = this.formatResult(result, confirmData.resolved);
                await interaction.editReply({ content: `✅ ${formattedMessage}` });
            } else {
                await interaction.editReply({ content: `❌ ${result.message}` });
            }
        } catch (error) {
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
    }

    /**
     * Main process handler
     */
    async process(message, userMessage) {
        try {
            // Step 1: Detect intent
            const intent = await this.detectIntent(userMessage);

            if (intent === 'chat') {
                // Use regular chatbot
                return { type: 'chat' };
            }

            // Step 2: Check permissions
            if (!this.hasPermission(message.member, message.author.id)) {
                return {
                    type: 'error',
                    message: '❌ You need Administrator permissions to execute actions.'
                };
            }

            // Step 3: Analyze request
            const analysis = await this.analyzeRequest(message, userMessage);

            // Step 4: Resolve entities
            const resolved = await this.resolveEntities(analysis, message);

            // Step 5: Check if confirmation needed
            if (analysis.requiresConfirmation) {
                await this.requestConfirmation(message, analysis, resolved);
                return { type: 'confirmation_pending' };
            }

            // Step 6: Generate and execute code
            const code = await this.generateCode(analysis, resolved, message);
            console.log('Generated Code:', code);
            
            const result = await this.executeCode(code, message);

            if (result.success) {
                const formattedMessage = this.formatResult(result, resolved);
                return {
                    type: 'success',
                    message: `✅ ${formattedMessage}`,
                    data: result.data
                };
            } else {
                return {
                    type: 'error',
                    message: `❌ ${result.message}`
                };
            }

        } catch (error) {
            console.error('Spectre AI processing error:', error);
            return {
                type: 'error',
                message: `❌ An error occurred: ${error.message}`
            };
        }
    }
}

module.exports = new SpectreAI();
