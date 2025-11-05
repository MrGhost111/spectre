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
- "me" = the user who sent the message

Your Task:
1. Identify the ACTION (what to do)
2. Identify TARGET entities (users, roles, channels, categories)
3. Extract any PARAMETERS (names, values, settings)
4. Detect if action involves mass pinging, @everyone, @here, or role mentions

Respond with ONLY valid JSON:
{
  "action": "descriptive action like 'create_channel', 'send_message', 'modify_permissions'",
  "description": "human readable description of what will happen",
  "detailedSteps": [
    "Step 1: Specific action that will be taken",
    "Step 2: Another specific action"
  ],
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
    "repliedMessage": true/false,
    "messageAuthor": true/false
  },
  "containsMassPing": false,
  "requiresConfirmation": true
}

IMPORTANT: Set "containsMassPing" to true if the action involves:
- Pinging @everyone or @here
- Pinging multiple users (more than 1)
- Pinging any roles
- Mass messaging multiple channels

Examples:
"create a channel called test in this category" →
{
  "action": "create_channel",
  "description": "Create a text channel named 'test' in the current category",
  "detailedSteps": [
    "Create a new text channel named 'test'",
    "Place it in the category: [Current Category Name]"
  ],
  "entities": {},
  "parameters": {"name": "test", "type": "text"},
  "usesContext": {"currentCategory": true},
  "containsMassPing": false,
  "requiresConfirmation": true
}

"send me 3 messages" →
{
  "action": "send_messages",
  "description": "Send 3 messages to the message author",
  "detailedSteps": [
    "Send message 1 in an embed to the current channel",
    "Send message 2 in an embed to the current channel",
    "Send message 3 in an embed to the current channel"
  ],
  "entities": {},
  "parameters": {"count": 3},
  "usesContext": {"messageAuthor": true, "currentChannel": true},
  "containsMassPing": false,
  "requiresConfirmation": true
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
                // Always require confirmation
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
     * Build context information about the message
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
5. Return an object with: { success: boolean, embed: EmbedBuilder }
6. Handle errors with try-catch
7. The code will have access to: message, guild, client, EmbedBuilder objects
8. ALL OUTPUT MUST BE IN AN EMBED - NO PLAIN TEXT MESSAGES
9. NO PINGING @everyone, @here, or roles - use role names without mentions
10. For sending messages, ALWAYS use embeds with EmbedBuilder
11. Use Colors from discord.js for embed colors

Example format for sending messages:
\`\`\`javascript
(async () => {
    try {
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('Action Completed')
            .setDescription('Description of what was done')
            .addFields({ name: 'Detail', value: 'Value' })
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        
        return { 
            success: true, 
            embed: new EmbedBuilder()
                .setColor(Colors.Green)
                .setDescription('✅ Successfully completed action')
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
                    { role: "system", content: "You are a Discord.js v14 code generator. Generate only executable JavaScript code that returns embeds." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 1200,
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
            const { PermissionFlagsBits, ChannelType, EmbedBuilder, Colors } = require('discord.js');
            const guild = message.guild;
            const client = message.client;
            const channel = message.channel;

            // Execute the code
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
                    .setDescription(`❌ Execution error: ${error.message}`)
            };
        }
    }

    /**
     * Create confirmation prompt for all actions
     */
    async requestConfirmation(message, analysis, resolved) {
        const confirmationId = `confirm_${Date.now()}_${message.author.id}`;

        const embed = new EmbedBuilder()
            .setColor(Colors.Orange)
            .setTitle('⚠️ Confirmation Required')
            .setDescription(`**Action:** ${analysis.description}`)
            .setFooter({ text: 'This action requires confirmation. You have 60 seconds to respond.' });

        // Add detailed steps
        if (analysis.detailedSteps && analysis.detailedSteps.length > 0) {
            let stepsText = '';
            analysis.detailedSteps.forEach((step, index) => {
                stepsText += `${index + 1}. ${step}\n`;
            });
            embed.addFields({ name: '📋 What will happen:', value: stepsText });
        }

        // Add details about what will be affected
        if (resolved.users.length > 0) {
            embed.addFields({
                name: '👥 Users',
                value: resolved.users.map(u => `${u.username} (${u.id})`).join('\n'),
                inline: true
            });
        }
        if (resolved.roles.length > 0) {
            embed.addFields({
                name: '🎭 Roles',
                value: resolved.roles.map(r => `${r.name} (${r.id})`).join('\n'),
                inline: true
            });
        }
        if (resolved.channels.length > 0) {
            embed.addFields({
                name: '📝 Channels',
                value: resolved.channels.map(c => `#${c.name} (${c.id})`).join('\n'),
                inline: true
            });
        }
        if (resolved.categories.length > 0) {
            embed.addFields({
                name: '📁 Categories',
                value: resolved.categories.map(c => `${c.name} (${c.id})`).join('\n'),
                inline: true
            });
        }

        // Add parameters if any
        if (analysis.parameters && Object.keys(analysis.parameters).length > 0) {
            const paramsText = Object.entries(analysis.parameters)
                .map(([key, value]) => `**${key}:** ${value}`)
                .join('\n');
            embed.addFields({ name: '⚙️ Parameters', value: paramsText });
        }

        // Warning for mass ping detection
        if (analysis.containsMassPing) {
            embed.addFields({
                name: '⚠️ Warning',
                value: '**This action has been blocked as it involves mass pinging or role mentions.**',
                inline: false
            });
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`${confirmationId}_confirm`)
                    .setLabel('Confirm')
                    .setStyle(analysis.containsMassPing ? ButtonStyle.Secondary : ButtonStyle.Danger)
                    .setEmoji('✅')
                    .setDisabled(analysis.containsMassPing),
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
            expiresAt: Date.now() + 60000,
            blocked: analysis.containsMassPing
        });

        // Auto-cleanup after 1 minute
        setTimeout(() => {
            if (this.pendingConfirmations.has(confirmationId)) {
                this.pendingConfirmations.delete(confirmationId);
                const expiredEmbed = new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setDescription('❌ Confirmation expired.');
                confirmMsg.edit({ embeds: [expiredEmbed], components: [] }).catch(() => { });
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

        if (!confirmed) {
            const cancelledEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setDescription('❌ Action cancelled.');
            await interaction.update({ embeds: [cancelledEmbed], components: [] });
            return;
        }

        if (confirmData.blocked) {
            const blockedEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setDescription('❌ This action is blocked due to mass ping detection.');
            await interaction.update({ embeds: [blockedEmbed], components: [] });
            return;
        }

        // Proceed with action
        const processingEmbed = new EmbedBuilder()
            .setColor(Colors.Yellow)
            .setDescription('⏳ Processing...');
        await interaction.update({ embeds: [processingEmbed], components: [] });

        try {
            const code = await this.generateCode(confirmData.analysis, confirmData.resolved, confirmData.message);
            console.log('Generated Code:', code);
            const result = await this.executeCode(code, confirmData.message);

            if (result && result.embed) {
                await interaction.editReply({ embeds: [result.embed] });
            } else {
                const errorEmbed = new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setDescription('❌ Action completed but no valid response returned.');
                await interaction.editReply({ embeds: [errorEmbed] });
            }
        } catch (error) {
            const errorEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setDescription(`❌ Error: ${error.message}`);
            await interaction.editReply({ embeds: [errorEmbed] });
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

            // Analyze request
            const analysis = await this.analyzeRequest(message, userMessage);

            // Resolve entities
            const resolved = await this.resolveEntities(analysis, message);

            // Always request confirmation
            await this.requestConfirmation(message, analysis, resolved);
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