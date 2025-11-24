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
     * Generate Discord.js v14 code with proper prompting
     */
    async generateCode(analysis, resolved, message, repliedData, progressMsg) {
        await progressMsg.edit({
            embeds: [new EmbedBuilder()
                .setColor(Colors.Yellow)
                .setTitle('⏳ Generating Code...')
                .setDescription('Creating execution plan...')
                .setTimestamp()]
        });

        const prompt = `You are a Discord.js v14 code generator. Generate executable JavaScript code that performs the requested action and returns results in the exact format specified.

ACTION TO PERFORM: ${analysis.action}
DESCRIPTION: ${analysis.description}

RESOLVED ENTITIES (use these in your code):
${resolved.users.length > 0 ? `USERS: ${resolved.users.map(u => `{ id: '${u.id}', username: '${u.username}' }`).join(', ')}` : 'USERS: none'}
${resolved.roles.length > 0 ? `ROLES: ${resolved.roles.map(r => `{ id: '${r.id}', name: '${r.name}' }`).join(', ')}` : 'ROLES: none'}
${resolved.channels.length > 0 ? `CHANNELS: ${resolved.channels.map(c => `{ id: '${c.id}', name: '${c.name}' }`).join(', ')}` : 'CHANNELS: none'}
${resolved.categories.length > 0 ? `CATEGORIES: ${resolved.categories.map(c => `{ id: '${c.id}', name: '${c.name}' }`).join(', ')}` : 'CATEGORIES: none'}

PARAMETERS: ${JSON.stringify(analysis.parameters)}

AVAILABLE VARIABLES (already imported):
- message, guild, client, channel
- PermissionFlagsBits, ChannelType, EmbedBuilder, Colors
- console, setTimeout, Promise, Date, JSON, Math

CRITICAL REQUIREMENTS:

1. RETURN FORMAT - YOU MUST RETURN THIS EXACT STRUCTURE:
   {
     success: boolean,
     results: [
       {
         title: string,
         description: string,
         fields?: [{ name: string, value: string, inline?: boolean }]
       }
     ]
   }

2. EMBED CONTENT REQUIREMENTS:
   - Use <@userId>, <@&roleId>, <#channelId> for mentions (they don't ping)
   - Show actual data processed, not just "success"
   - Include specific outcomes, counts, names
   - For operations: show what was modified/affected
   - For fetches: show the data retrieved

3. ERROR HANDLING:
   - Wrap ALL code in try-catch
   - Return success: false with error message in catch block
   - Handle cases where entities might not exist

4. DISCORD.JS v14 SPECIFICS:
   - Use PermissionFlagsBits for permissions
   - Use ChannelType for channel types
   - Use EmbedBuilder for embeds
   - Use Colors for embed colors

5. PERFORMANCE:
   - Batch operations for >100 items
   - Split large data across multiple embeds
   - Handle message fetching with pagination

EXAMPLE FOR BANNING A USER:

\`\`\`javascript
(async () => {
  try {
    // Use the resolved user from the entities above
    const targetUser = guild.members.cache.get('USER_ID_FROM_RESOLVED_ENTITIES');
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
        description: \`Successfully banned <@\${targetUser.id}> (\${targetUser.user.tag})\`,
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

EXAMPLE FOR LISTING CHANNEL INFO:

\`\`\`javascript
(async () => {
  try {
    const channel = message.channel;
    return {
      success: true,
      results: [{
        title: '📊 Channel Information',
        description: \`Information about <#\${channel.id}>\`,
        fields: [
          { name: 'Name', value: channel.name, inline: true },
          { name: 'ID', value: channel.id, inline: true },
          { name: 'Type', value: ChannelType[channel.type], inline: true },
          { name: 'Category', value: channel.parent?.name || 'None', inline: true },
          { name: 'Created', value: \`<t:\${Math.floor(channel.createdTimestamp / 1000)}:R>\`, inline: true }
        ]
      }]
    };
  } catch (error) {
    return {
      success: false,
      results: [{
        title: '❌ Error',
        description: \`Failed to get channel info: \${error.message}\`
      }]
    };
  }
})();
\`\`\`

IMPORTANT: Your code MUST return the exact structure shown above. Generate the code now for the action: "${analysis.action}"`;

        try {
            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    {
                        role: "system",
                        content: `You are a Discord.js v14 expert. Generate ONLY executable JavaScript code that returns { success: boolean, results: Array }.
                        
CRITICAL RULES:
1. ALWAYS return the exact structure: { success: boolean, results: Array }
2. ALWAYS wrap code in try-catch
3. ALWAYS use the resolved entities provided
4. ALWAYS include meaningful results with actual data
5. NEVER return undefined or invalid structures`
                    },
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

            // Clean the code
            let cleanCode = code.trim();

            // Remove existing async wrappers if present
            if (cleanCode.startsWith('(async () => {') && cleanCode.endsWith('})()')) {
                cleanCode = cleanCode.slice(14, -4).trim();
            } else if (cleanCode.startsWith('(async function() {') && cleanCode.endsWith('})()')) {
                cleanCode = cleanCode.slice(19, -4).trim();
            }

            const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
            const executor = new AsyncFunction(
                'message', 'guild', 'client', 'channel',
                'PermissionFlagsBits', 'ChannelType', 'EmbedBuilder', 'Colors',
                'require', 'console', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'Promise', 'Date', 'JSON', 'Math',
                `return (async () => { ${cleanCode} })();`
            );

            const result = await executor(
                message, guild, client, channel,
                PermissionFlagsBits, ChannelType, EmbedBuilder, Colors,
                require, console, setTimeout, setInterval, clearTimeout, clearInterval, Promise, Date, JSON, Math
            );

            return result;

        } catch (error) {
            console.error('Code execution error:', error);
            // Let the AI handle the error structure through prompting
            throw error;
        }
    }

    /**
     * Analyze request and generate code BEFORE confirmation
     */
    async analyzeAndPrepare(message, userMessage, progressMsg) {
        const contextInfo = this.buildContextInfo(message);
        const repliedData = await this.getRepliedMessageData(message);

        const prompt = `Analyze this Discord action request and extract entities and context.

User Message: "${userMessage}"

Context:
${contextInfo}

${repliedData ? `Replied Message:
- Author: ${repliedData.author.username}
- Content: ${repliedData.content}` : ''}

Entity Resolution Rules:
- "ban def bot" → target user "def bot"
- "give me admin" → target message author
- "delete general" → target channel "general"  
- "this user" (when replying) → target replied user
- Specific names = search for those entities

Return ONLY valid JSON:
{
  "action": "action_description",
  "description": "human_readable_description", 
  "detailedSteps": ["step1", "step2"],
  "entities": {
    "users": ["username1", "def bot"],
    "roles": ["rolename1"], 
    "channels": ["channelname1"],
    "categories": ["categoryname1"]
  },
  "parameters": {"key": "value"},
  "usesContext": {
    "currentChannel": boolean,
    "currentCategory": boolean, 
    "repliedUser": boolean,
    "repliedMessage": boolean,
    "messageAuthor": boolean
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
                    { role: "system", content: "You are a Discord action analyzer. Respond only with valid JSON. Extract specific entity names mentioned." },
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

        const action = analysis.action.toLowerCase();
        const destructiveKeywords = ['delete', 'remove', 'ban', 'kick'];

        if (destructiveKeywords.some(keyword => action.includes(keyword))) {
            const totalTargets = (resolved.channels?.length || 0) +
                (resolved.users?.length || 0) +
                (resolved.roles?.length || 0);

            if (totalTargets > 5) {
                dangers.isBlocked = true;
                dangers.reasons.push(`Mass ${action} detected (${totalTargets} targets)`);
            }
        }

        return dangers;
    }

    /**
     * Create confirmation with code already generated
     */
    async createConfirmation(message, analysis, resolved, repliedData, code) {
        const confirmationId = `confirm_${Date.now()}_${message.author.id}`;

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

        // Show execution steps
        if (analysis.detailedSteps && analysis.detailedSteps.length > 0) {
            let stepsText = analysis.detailedSteps.map((step, i) => `${i + 1}. ${step}`).join('\n');
            if (stepsText.length > 1024) {
                stepsText = stepsText.substring(0, 1020) + '...';
            }
            embed.addFields({
                name: '📋 Execution Plan',
                value: stepsText,
                inline: false
            });
        }

        // Show affected entities
        if (resolved.users.length > 0) {
            const userList = resolved.users.map(u => `• <@${u.id}> (${u.username})`).join('\n');
            embed.addFields({
                name: '👥 Target Users',
                value: userList.length > 1024 ? userList.substring(0, 1020) + '...' : userList,
                inline: true
            });
        }

        if (resolved.roles.length > 0) {
            const roleList = resolved.roles.map(r => `• <@&${r.id}> (${r.name})`).join('\n');
            embed.addFields({
                name: '🎭 Target Roles',
                value: roleList.length > 1024 ? roleList.substring(0, 1020) + '...' : roleList,
                inline: true
            });
        }

        if (resolved.channels.length > 0) {
            const channelList = resolved.channels.map(c => `• <#${c.id}> (${c.name})`).join('\n');
            embed.addFields({
                name: '📝 Target Channels',
                value: channelList.length > 1024 ? channelList.substring(0, 1020) + '...' : channelList,
                inline: true
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

        setTimeout(() => {
            if (this.pendingConfirmations.has(confirmationId)) {
                this.pendingConfirmations.delete(confirmationId);
                embed.setTitle('⏰ Confirmation Expired').setColor(Colors.Red);
                confirmMsg.edit({ embeds: [embed], components: [] }).catch(() => { });
            }
        }, 60000);
    }

    /**
     * Handle confirmation button clicks
     */
    async handleConfirmation(interaction, confirmed) {
        const customId = interaction.customId;
        const confirmationId = customId.replace(/_confirm$|_cancel$/, '');

        const confirmData = this.pendingConfirmations.get(confirmationId);

        if (!confirmData || Date.now() > confirmData.expiresAt || confirmData.authorId !== interaction.user.id) {
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setDescription('❌ This confirmation has expired or is invalid.')],
                ephemeral: true
            });
        }

        this.pendingConfirmations.delete(confirmationId);

        const originalEmbed = interaction.message.embeds[0];

        if (!confirmed || confirmData.blocked) {
            const cancelledEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(Colors.Red)
                .setTitle(confirmData.blocked ? '❌ Action Blocked' : '❌ Action Cancelled');
            await interaction.update({ embeds: [cancelledEmbed], components: [] });
            return;
        }

        // Update to executing
        const executingEmbed = EmbedBuilder.from(originalEmbed)
            .setColor(Colors.Yellow)
            .setTitle('⚙️ Executing...')
            .setFooter({ text: 'Running action...' });

        await interaction.update({ embeds: [executingEmbed], components: [] });

        try {
            const result = await this.executeCode(confirmData.code, confirmData.message);

            // Let the AI handle the result structure through proper prompting
            const success = result && result.success === true;

            const completedEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(success ? Colors.Green : Colors.Red)
                .setTitle(success ? '✅ Action Completed' : '❌ Action Failed')
                .setFooter({ text: success ? 'Execution finished' : 'Execution failed' });

            await interaction.editReply({ embeds: [completedEmbed] });

            // Send results from AI execution
            if (result && result.results && Array.isArray(result.results)) {
                for (const output of result.results) {
                    if (output.title || output.description) {
                        const outputEmbed = new EmbedBuilder()
                            .setColor(success ? Colors.Green : Colors.Red)
                            .setTitle(output.title || (success ? '📊 Result' : '❌ Error'))
                            .setTimestamp();

                        if (output.description) outputEmbed.setDescription(output.description);
                        if (output.fields) outputEmbed.addFields(output.fields);

                        await confirmData.message.channel.send({ embeds: [outputEmbed] });
                    }
                }
            }

        } catch (error) {
            console.error('Execution error:', error);
            const errorEmbed = EmbedBuilder.from(originalEmbed)
                .setColor(Colors.Red)
                .setTitle('❌ Execution Failed');

            await interaction.editReply({ embeds: [errorEmbed] });

            const errorOutputEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ Error')
                .setDescription(error.message)
                .setTimestamp();

            await confirmData.message.channel.send({ embeds: [errorOutputEmbed] });
        }
    }

    /**
     * Main process handler
     */
    async process(message, userMessage) {
        try {
            if (!this.hasPermission(message.member, message.author.id)) {
                return { type: 'no_permission' };
            }

            const progressMsg = await message.reply({
                embeds: [new EmbedBuilder()
                    .setColor(Colors.Yellow)
                    .setTitle('⏳ Processing...')
                    .setDescription('Starting analysis...')
                    .setTimestamp()]
            });

            const { analysis, resolved, repliedData, code } = await this.analyzeAndPrepare(
                message, userMessage, progressMsg
            );

            await progressMsg.delete();
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