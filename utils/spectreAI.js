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
    }

    /**
     * Check if user has permission to execute actions
     */
    hasPermission(member, userId) {
        if (userId === '753491023208120321') {
            return true;
        }
        if (member && member.permissions.has('Administrator')) {
            return true;
        }
        return false;
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
                embeds: []
            };

            // Extract embed data
            if (repliedMsg.embeds.length > 0) {
                repliedMsg.embeds.forEach(embed => {
                    const embedData = {
                        title: embed.title || '',
                        description: embed.description || '',
                        fields: embed.fields.map(f => ({ name: f.name, value: f.value }))
                    };
                    data.embeds.push(embedData);
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
            reasons: []
        };

        // Check for message spam (more than 10 messages)
        if (analysis.parameters) {
            const messageCount = parseInt(analysis.parameters.count) ||
                parseInt(analysis.parameters.amount) ||
                parseInt(analysis.parameters.messages) || 0;

            if (messageCount > 10) {
                dangers.isSpam = true;
                dangers.reasons.push(`⚠️ Attempting to send ${messageCount} messages (max: 10)`);
            }
        }

        // Check for mass deletion/ban (nuke protection)
        const action = analysis.action.toLowerCase();
        const keywords = ['delete', 'remove', 'ban', 'kick'];

        if (keywords.some(keyword => action.includes(keyword))) {
            const totalTargets = (analysis.entities.channels?.length || 0) +
                (analysis.entities.users?.length || 0) +
                (analysis.entities.roles?.length || 0);

            if (totalTargets > 3) {
                dangers.isNuke = true;
                dangers.reasons.push(`🚨 Mass ${action} detected (${totalTargets} targets, max: 3)`);
            }
        }

        // Check for actual message pinging (not embed mentions)
        if (action.includes('ping') || action.includes('mention')) {
            const pingCount = (analysis.entities.users?.length || 0) +
                (analysis.entities.roles?.length || 0);

            if (pingCount > 1 || analysis.entities.roles?.length > 0) {
                dangers.isMassPing = true;
                dangers.reasons.push('📢 Mass pinging/role mentions outside embeds not allowed');
            }
        }

        // Check for @everyone or @here
        if (analysis.parameters) {
            const paramsStr = JSON.stringify(analysis.parameters).toLowerCase();
            if (paramsStr.includes('@everyone') || paramsStr.includes('@here')) {
                dangers.isMassPing = true;
                dangers.reasons.push('📢 @everyone/@here mentions not allowed');
            }
        }

        return dangers;
    }

    /**
     * Analyze request (without generating code yet)
     */
    async analyzeRequest(message, userMessage) {
        const contextInfo = await this.buildContextInfo(message);
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

Discord Entities Explained:
- Users: Members of the server (can be mentioned with @username or by name)
- Roles: Permission groups (can be mentioned with @rolename or by name)
- Channels: Text/voice channels (can be mentioned with #channel or by name)
- Categories: Groups of channels

Your Task:
1. Identify the ACTION (what to do)
2. Identify TARGET entities (users, roles, channels, categories)
3. Extract any PARAMETERS (names, values, settings)
4. Describe detailed steps of what will happen
5. Understand context and pronouns correctly

Respond with ONLY valid JSON:
{
  "action": "descriptive_action_name",
  "description": "Brief human readable description",
  "detailedSteps": [
    "Step 1: Specific action that will be taken",
    "Step 2: Another specific action"
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
}

Examples:
"translate this" (while replying) → use repliedMessage data
"give me a role called member" → target messageAuthor, create/assign role "member"
"send 5 messages here" → send to currentChannel`;

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

            if (!jsonMatch) {
                throw new Error('Failed to parse AI response');
            }

            const analysis = JSON.parse(jsonMatch[0]);

            // Resolve entities
            const resolved = await this.resolveEntities(analysis, message, repliedData);

            return { analysis, resolved, repliedData };
        } catch (error) {
            console.error('Request analysis error:', error);
            throw error;
        }
    }

    /**
     * Build context information
     */
    async buildContextInfo(message) {
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
     * Generate Discord.js v14 code with batching support
     */
    async generateCode(analysis, resolved, message, repliedData) {
        const prompt = `Generate Discord.js v14 code to perform this action.

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

AVAILABLE VARIABLES (already defined, DO NOT redefine):
- message: The Discord message object
- guild: The guild object (message.guild)
- client: The Discord client
- channel: The channel object (message.channel)
- PermissionFlagsBits: For permissions
- ChannelType: For channel types
- EmbedBuilder: For creating embeds
- Colors: For embed colors

CRITICAL REQUIREMENTS:
1. Use ONLY Discord.js v14+ syntax
2. DO NOT use 'const guild = ' or 'const client = ' - they are already provided
3. Access entities by their IDs using guild.channels.cache.get(id), guild.members.cache.get(id), guild.roles.cache.get(id)
4. Return: { success: boolean, results: Array<{title: string, description: string, fields?: Array}> }
5. ALL OUTPUT MUST BE IN EMBEDS - results array will be used to create multiple embeds
6. Each result object MUST have a description (required) and can have title and fields
7. If description > 1024 chars, split into multiple result objects
8. For batch operations (>30 items), process in batches of 25
9. Mentions in embeds are ALLOWED (they don't ping) - use <@userId>, <@&roleId>, <#channelId>
10. NEVER send plain text messages - only return results array
11. Handle errors gracefully with try-catch
12. Always return the results object even if action fails

Example structure:
\`\`\`javascript
(async () => {
    try {
        const results = [];
        
        // Example: Send a message
        const targetChannel = guild.channels.cache.get('${message.channel.id}');
        if (!targetChannel) {
            return {
                success: false,
                results: [{
                    title: '❌ Error',
                    description: 'Channel not found'
                }]
            };
        }
        
        await targetChannel.send('Hello!');
        
        results.push({
            title: '✅ Success',
            description: 'Message sent successfully'
        });
        
        return { success: true, results };
    } catch (error) {
        return { 
            success: false, 
            results: [{
                title: '❌ Error',
                description: error.message || 'An error occurred'
            }]
        };
    }
})();
\`\`\`

Generate the code now (wrap in async IIFE):`;

        try {
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    { role: "system", content: "You are a Discord.js v14 code generator. Generate only executable JavaScript code." },
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

            // Use AI to explain the error
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
     * Use AI to explain errors in user-friendly way
     */
    async explainError(error, code) {
        const prompt = `Explain this error in simple terms for a Discord user:

Error: ${error.message}
Stack: ${error.stack?.split('\n').slice(0, 3).join('\n') || 'N/A'}

Code context:
\`\`\`javascript
${code.substring(0, 500)}
\`\`\`

Provide a brief, user-friendly explanation (max 200 chars) of what went wrong and why.`;

        try {
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    { role: "system", content: "Explain errors simply and concisely." },
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
     * Create confirmation prompt
     */
    async requestConfirmation(message, analysis, resolved, repliedData) {
        const confirmationId = `confirm_${Date.now()}_${message.author.id}`;

        // Check for dangerous actions
        const dangers = this.isDangerousAction(analysis);
        const isBlocked = dangers.isSpam || dangers.isNuke || dangers.isMassPing;

        const embed = new EmbedBuilder()
            .setColor(isBlocked ? Colors.Red : Colors.Orange)
            .setTitle(isBlocked ? '🚫 Action Blocked' : '⚠️ Confirmation Required')
            .setDescription(`**Action:** ${analysis.description}`)
            .setFooter({ text: isBlocked ? 'This action has been blocked for safety.' : 'You have 60 seconds to respond.' });

        // Show what will happen
        if (analysis.detailedSteps && analysis.detailedSteps.length > 0) {
            let stepsText = '';
            analysis.detailedSteps.forEach((step, index) => {
                stepsText += `${index + 1}. ${step}\n`;
            });

            // Split if too long
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

        // Show danger reasons if blocked
        if (isBlocked && dangers.reasons.length > 0) {
            embed.addFields({
                name: '🚨 Blocked Reasons',
                value: dangers.reasons.join('\n'),
                inline: false
            });
        }

        // Add entity details
        if (resolved.users.length > 0) {
            const userText = resolved.users.map(u => `${u.username}`).join(', ');
            embed.addFields({
                name: '👥 Users',
                value: userText.length > 1024 ? userText.substring(0, 1021) + '...' : userText,
                inline: true
            });
        }
        if (resolved.roles.length > 0) {
            const roleText = resolved.roles.map(r => r.name).join(', ');
            embed.addFields({
                name: '🎭 Roles',
                value: roleText.length > 1024 ? roleText.substring(0, 1021) + '...' : roleText,
                inline: true
            });
        }
        if (resolved.channels.length > 0) {
            const channelText = resolved.channels.map(c => `#${c.name}`).join(', ');
            embed.addFields({
                name: '📝 Channels',
                value: channelText.length > 1024 ? channelText.substring(0, 1021) + '...' : channelText,
                inline: true
            });
        }

        // Add parameters
        if (analysis.parameters && Object.keys(analysis.parameters).length > 0) {
            const paramsText = Object.entries(analysis.parameters)
                .map(([key, value]) => `**${key}:** ${value}`)
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

        // Store confirmation data with repliedData included
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
        console.log(`📊 Total pending confirmations: ${this.pendingConfirmations.size}`);

        setTimeout(() => {
            if (this.pendingConfirmations.has(confirmationId)) {
                this.pendingConfirmations.delete(confirmationId);
                console.log(`⏰ Confirmation expired: ${confirmationId}`);
                embed.setTitle('⏰ Confirmation Expired').setColor(Colors.Red);
                confirmMsg.edit({ embeds: [embed], components: [] }).catch(() => { });
            }
        }, 60000);

        return confirmationId;
    }

    /**
     * Handle confirmation button clicks
     */
    async handleConfirmation(interaction, confirmed) {
        // Fix: Properly extract confirmation ID by removing both suffixes
        const customId = interaction.customId;
        const confirmationId = customId.replace(/_confirm$|_cancel$/, '');

        console.log(`🔘 Button clicked: ${customId}`);
        console.log(`🔑 Extracted confirmation ID: ${confirmationId}`);
        console.log(`📋 Pending confirmations: [${Array.from(this.pendingConfirmations.keys()).join(', ')}]`);

        const confirmData = this.pendingConfirmations.get(confirmationId);

        if (!confirmData) {
            console.log(`❌ Confirmation data not found for: ${confirmationId}`);
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription('❌ This confirmation has expired.')],
                ephemeral: true
            });
        }

        // Check if expired
        if (Date.now() > confirmData.expiresAt) {
            this.pendingConfirmations.delete(confirmationId);
            console.log(`⏰ Confirmation expired: ${confirmationId}`);
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
        console.log(`🗑️ Confirmation removed: ${confirmationId}`);

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

        // Update to processing
        const processingEmbed = EmbedBuilder.from(originalEmbed)
            .setColor(Colors.Yellow)
            .setTitle('⏳ Processing...')
            .setFooter({ text: 'Executing action...' });

        await interaction.update({ embeds: [processingEmbed], components: [] });

        try {
            // Generate code now (after confirmation)
            console.log('🔧 Generating code...');
            const code = await this.generateCode(
                confirmData.analysis,
                confirmData.resolved,
                confirmData.message,
                confirmData.repliedData
            );

            console.log('📝 Generated Code:', code);

            // Execute the generated code
            console.log('⚙️ Executing code...');
            const result = await this.executeCode(code, confirmData.message);

            // Update confirmation to completed FIRST
            const completedEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(Colors.Green)
                .setTitle('✅ Action Completed')
                .setFooter({ text: 'Results sent below' });

            await interaction.editReply({ embeds: [completedEmbed] });

            // Then send separate output embed(s) in the channel
            if (result && result.results && result.results.length > 0) {
                for (const output of result.results) {
                    const outputEmbed = new EmbedBuilder()
                        .setColor(result.success ? Colors.Green : Colors.Red)
                        .setTitle(output.title || '📊 Result')
                        .setTimestamp();

                    // Handle description
                    if (output.description) {
                        outputEmbed.setDescription(output.description);
                    }

                    // Handle fields
                    if (output.fields && output.fields.length > 0) {
                        outputEmbed.addFields(output.fields);
                    }

                    // Send in the original message channel, not as a reply to interaction
                    await confirmData.message.channel.send({ embeds: [outputEmbed] });
                }
            } else {
                // Fallback if no results
                const fallbackEmbed = new EmbedBuilder()
                    .setColor(Colors.Blue)
                    .setTitle('📊 Result')
                    .setDescription('Action completed successfully.')
                    .setTimestamp();

                await confirmData.message.channel.send({ embeds: [fallbackEmbed] });
            }

        } catch (error) {
            console.error('💥 Execution error:', error);
            console.error('Error stack:', error.stack);

            // Update confirmation to show failure
            const errorEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(Colors.Red)
                .setTitle('❌ Action Failed')
                .setFooter({ text: 'Error details sent below' });

            await interaction.editReply({ embeds: [errorEmbed] });

            // Send error details as a NEW embed in the channel
            const errorOutputEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ Execution Error')
                .setDescription(error.message || 'An unknown error occurred')
                .setTimestamp();

            // Add error stack if available (truncated)
            if (error.stack) {
                const stackPreview = error.stack.split('\n').slice(0, 5).join('\n');
                if (stackPreview.length > 1024) {
                    errorOutputEmbed.addFields({
                        name: 'Stack Trace',
                        value: '```' + stackPreview.substring(0, 1010) + '...```'
                    });
                } else {
                    errorOutputEmbed.addFields({
                        name: 'Stack Trace',
                        value: '```' + stackPreview + '```'
                    });
                }
            }

            await confirmData.message.channel.send({ embeds: [errorOutputEmbed] });
        }
    }

    /**
     * Main process handler
     */
    async process(message, userMessage) {
        try {
            if (!this.hasPermission(message.member, message.author.id)) {
                return {
                    type: 'error',
                    embed: new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setDescription('❌ You need Administrator permissions to execute actions.')
                };
            }

            // Analyze and create confirmation
            const { analysis, resolved, repliedData } = await this.analyzeRequest(message, userMessage);
            await this.requestConfirmation(message, analysis, resolved, repliedData);

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