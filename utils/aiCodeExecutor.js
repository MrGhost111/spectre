const { VM } = require('vm2');
const { HfInference } = require('@huggingface/inference');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
require('dotenv').config();

class AICodeExecutor {
    constructor() {
        this.hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

        // Define dangerous patterns that should NEVER be in generated code
        this.dangerousPatterns = [
            /require\s*\(\s*['"]child_process['"]\s*\)/gi,
            /require\s*\(\s*['"]fs['"]\s*\)/gi,
            /require\s*\(\s*['"]path['"]\s*\)/gi,
            /eval\s*\(/gi,
            /Function\s*\(/gi,
            /process\./gi,
            /\.exec\s*\(/gi,
            /\.spawn\s*\(/gi,
            /import\s+.*from/gi,
            /__dirname/gi,
            /__filename/gi,
            /global\./gi,
            /\.env/gi,
            /token/gi,
            /password/gi,
        ];

        // Owner ID for admin-only code execution
        this.ownerId = '753491023208120321';

        // Store pending confirmations
        this.pendingConfirmations = new Map();
    }

    /**
     * Check if user has permission to execute AI-generated code
     */
    hasPermission(userId, message) {
        // Only owner or users with Administrator permission
        return userId === this.ownerId ||
            message.member?.permissions.has('Administrator');
    }

    /**
     * Determine if action requires confirmation (for safety, not permissions)
     */
    requiresConfirmation(code, intent) {
        const dangerousActions = [
            { pattern: /\.ban\s*\(/gi, description: '⛔ Banning a user' },
            { pattern: /\.kick\s*\(/gi, description: '👢 Kicking a user' },
            { pattern: /\.timeout\s*\(/gi, description: '⏸️ Timing out a user' },
            { pattern: /channel\.delete\s*\(/gi, description: '🗑️ Deleting a channel' },
            { pattern: /role\.delete\s*\(/gi, description: '🗑️ Deleting a role' },
            { pattern: /PermissionFlagsBits\.Administrator/gi, description: '👑 Granting Administrator permissions' },
            { pattern: /PermissionFlagsBits\.ManageMessages/gi, description: '📝 Granting Manage Messages permissions' },
            { pattern: /PermissionFlagsBits\.ManageRoles/gi, description: '🎭 Granting Manage Roles permissions' },
            { pattern: /PermissionFlagsBits\.ManageChannels/gi, description: '📁 Granting Manage Channels permissions' },
            { pattern: /PermissionFlagsBits\.ManageGuild/gi, description: '⚙️ Granting Manage Server permissions' },
            { pattern: /PermissionFlagsBits\.BanMembers/gi, description: '🔨 Granting Ban Members permissions' },
            { pattern: /PermissionFlagsBits\.KickMembers/gi, description: '👢 Granting Kick Members permissions' },
        ];

        const matched = dangerousActions.filter(action => action.pattern.test(code));

        if (matched.length > 0) {
            return {
                needsConfirmation: true,
                reasons: matched.map(m => m.description)
            };
        }

        return { needsConfirmation: false, reasons: [] };
    }

    /**
     * Validate generated code for security issues
     */
    validateCode(code) {
        const issues = [];

        // Check for dangerous patterns
        for (const pattern of this.dangerousPatterns) {
            if (pattern.test(code)) {
                issues.push(`Dangerous pattern detected: ${pattern.source}`);
            }
        }

        // Check for require() calls (only allow discord.js)
        const requireMatches = code.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/gi);
        for (const match of requireMatches) {
            const module = match[1];
            if (module !== 'discord.js') {
                issues.push(`Unsafe module import: ${module}`);
            }
        }

        return {
            safe: issues.length === 0,
            issues
        };
    }

    /**
     * Parse user intent to understand WHO the action targets
     */
    async parseUserIntent(userRequest, context) {
        try {
            const prompt = `You are analyzing a Discord bot command to determine WHO the action should target.

**Discord Context Rules:**
- "me", "myself", "I", "my" = THE PERSON WHO SENT THE COMMAND (Author ID: ${context.userId})
- "you", "yourself", "your" = THE BOT (not a valid target for most actions)
- Mentioned users (@User) = That specific user
- "them", "this person", "that user" (with reply) = The person they replied to
- Role names = That role
- Channel names = That channel

**User Request:** "${userRequest}"

**Context:**
- Command Author: User ID ${context.userId}
- Replied to: ${context.replyContext?.hasReply ? context.replyContext.repliedUser.username + ' (ID: ' + context.replyContext.repliedUser.id + ')' : 'No one'}
- Detected users: ${context.entities?.users?.map(u => u.username + ' (ID: ' + u.id + ')').join(', ') || 'none'}
- Detected roles: ${context.entities?.roles?.map(r => r.name + ' (ID: ' + r.id + ')').join(', ') || 'none'}
- Detected channels: ${context.entities?.channels?.map(c => c.name + ' (ID: ' + c.id + ')').join(', ') || 'none'}

Respond with ONLY valid JSON:
{
  "targetType": "self" | "user" | "role" | "channel" | "bot" | "unknown",
  "targetId": "the ID of the target",
  "targetName": "human readable name",
  "confidence": "high" | "medium" | "low",
  "reasoning": "brief explanation"
}

Examples:
- "give me admin role" -> {"targetType": "self", "targetId": "${context.userId}", "targetName": "yourself", "confidence": "high"}
- "mute @john" -> {"targetType": "user", "targetId": "john's ID", "targetName": "@john", "confidence": "high"}
- "mute this guy" (replied to someone) -> {"targetType": "user", "targetId": "replied user ID", "targetName": "the user you replied to"}`;

            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    { role: "system", content: "You are an intent analyzer. Respond only with JSON." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 200,
                temperature: 0.2
            });

            const aiResponse = response.choices[0].message.content;
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            return { targetType: 'unknown', confidence: 'low' };
        } catch (error) {
            console.error('Intent parsing error:', error);
            return { targetType: 'unknown', confidence: 'low' };
        }
    }

    /**
     * Build comprehensive Discord context explanation for AI
     */
    buildDiscordContext(context) {
        let contextExplanation = `**DISCORD CONTEXT - UNDERSTAND THIS FIRST:**

**1. "THIS CHANNEL" / "HERE":**
   - Means: channel (the channel where command was sent)
   - Channel ID: ${context.channelId}
   - Channel Name: ${context.currentChannelName || 'unknown'}
   - Use: channel variable is already available

**2. "THIS CATEGORY" / "THIS CATEGORY HERE":**
   - Means: The category that contains the current channel
   - Category ID: ${context.currentCategoryId || 'none (no parent)'}
   - Use: channel.parentId OR channel.parent

**3. "THIS USER" / "THIS PERSON" / "THEM":**`;

        if (context.replyContext?.hasReply) {
            contextExplanation += `
   - User replied to: ${context.replyContext.repliedUser.username}
   - User ID: ${context.replyContext.repliedUser.id}
   - Means: The person they replied to
   - Use: guild.members.cache.get('${context.replyContext.repliedUser.id}')`;
        } else {
            contextExplanation += `
   - No reply detected
   - If user says "this user" without context, ask for clarification OR assume they mean themselves`;
        }

        contextExplanation += `

**4. "ME" / "MYSELF" / "MY" / "I":**
   - Means: The command author (person who sent the command)
   - User ID: ${context.userId}
   - Use: user variable OR guild.members.cache.get('${context.userId}')

**5. "THIS MESSAGE":**`;

        if (context.replyContext?.hasReply) {
            contextExplanation += `
   - Message ID: ${context.replyContext.repliedMessage?.id}
   - Content: "${context.replyContext.repliedContent?.slice(0, 100)}"
   - Use: channel.messages.cache.get('${context.replyContext.repliedMessage?.id}')`;
        } else {
            contextExplanation += `
   - No reply detected
   - Cannot reference a message without replying to it`;
        }

        contextExplanation += `

**6. DETECTED ENTITIES:**
   - Users mentioned: ${context.entities?.users?.map(u => `${u.username} (${u.id})`).join(', ') || 'none'}
   - Roles mentioned: ${context.entities?.roles?.map(r => `${r.name} (${r.id})`).join(', ') || 'none'}
   - Channels mentioned: ${context.entities?.channels?.map(c => `${c.name} (${c.id})`).join(', ') || 'none'}

**7. AVAILABLE VARIABLES (USE THESE DIRECTLY):**
   - channel = Current channel where command was sent
   - guild = The Discord server
   - user = Command author
   - message = The command message object
   - client = Bot client
   - entities = Object containing detected users/roles/channels

**8. COMMON PHRASES TRANSLATION:**
   - "in this category" = parent: channel.parentId
   - "in here" = parent: channel.id (if channel is category) OR same channel
   - "move this channel" = await channel.setPosition(X)
   - "rename this" = await channel.setName('newname')
   - "delete this channel" = await channel.delete()
   - "give me X role" = await guild.members.cache.get('${context.userId}').roles.add(roleId)
   - "mute this person" (with reply) = timeout the replied user
`;

        return contextExplanation;
    }

    /**
     * Generate code using AI based on user request
     */
    async generateCode(userRequest, context = {}) {
        try {
            // Parse user intent first
            const intent = await this.parseUserIntent(userRequest, context);
            console.log('Parsed Intent:', intent);

            // Build comprehensive Discord context
            const discordContext = this.buildDiscordContext(context);

            // Build context description
            let contextDescription = `**Available Context:**
- Guild ID: ${context.guildId}
- Channel ID: ${context.channelId}
- Command Author ID: ${context.userId} (THIS IS WHO SENT THE COMMAND)
- Current channel object: 'channel' variable
- Detected entities: ${JSON.stringify(context.entities || {})}`;

            // Add reply context if available
            if (context.replyContext && context.replyContext.hasReply) {
                contextDescription += `
- REPLIED MESSAGE: User replied to ${context.replyContext.repliedUser.username} (ID: ${context.replyContext.repliedUser.id})`;
            }

            // Add intent information
            if (intent.targetType !== 'unknown') {
                contextDescription += `

**CRITICAL: Target Analysis**
- Action should target: ${intent.targetName} (${intent.targetType})
- Target ID: ${intent.targetId}
- Reasoning: ${intent.reasoning}`;
            }

            const prompt = `You are a Discord.js v14 bot code generator. Generate ONLY executable JavaScript code based on the user's request.

**CRITICAL RULES:**
1. Generate ONLY the function body code - NO function declarations, NO exports, NO comments
2. Use ONLY these available objects:
   - message (Discord.js Message object)
   - guild (Discord.js Guild object)
   - channel (Discord.js Channel object - THE CURRENT CHANNEL where command was used)
   - user (Discord.js User object - this is THE COMMAND AUTHOR)
   - client (Discord.js Client object)
   - entities (object with users, roles, channels arrays)
   - EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType (ALREADY IMPORTED)
3. Use async/await for all Discord operations
4. ALWAYS return a detailed result object with EXACTLY what happened
5. Handle all errors with try-catch
6. DO NOT use: require(), import, process, fs, child_process, eval, Function
7. DO NOT access environment variables or tokens
8. ALWAYS close all braces properly
9. **DO NOT CHECK PERMISSIONS** - Just attempt the action. If it fails, the error will be caught.
10. **NEVER use member.permissions.has()** or any permission checking - THE BOT WILL HANDLE THAT

**RETURN FORMAT (CRITICAL):**
Always return an object with:
{
  success: true/false,
  message: "DETAILED description of what happened to WHO",
  action: "brief action name",
  target: "who/what was affected",
  details: {} // optional extra info
}

**Example: "give me admin role"**
- Target: user (the command author, NOT someone else!)
- Return: { success: true, message: "✅ Gave Administrator role to <@${context.userId}>", action: "role_add", target: "${context.userId}" }

**IMPORTANT - DO NOT CHECK PERMISSIONS:**
❌ BAD: if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) return { success: false, message: "No perms" };
✅ GOOD: Just do the action and let Discord API return an error if bot lacks permissions

**IMPORTANT LIMITATIONS:**
- Discord does NOT provide "last seen" or "last online" data through the API
- Presence/status requires special intents and only shows CURRENT status
- To track last seen, you need a custom database system
- If user asks for "last seen/online", explain this limitation

**Discord.js v14 SYNTAX - USE THESE:**

**Embeds (v14):**
✅ new EmbedBuilder()
❌ NOT: new MessageEmbed() or new Discord.MessageEmbed()

**Buttons (v14):**
✅ new ButtonBuilder().setCustomId('id').setLabel('Click').setStyle(ButtonStyle.Primary)
✅ new ActionRowBuilder().addComponents(button)
❌ NOT: MessageButton or MessageActionRow

**Permissions (v14):**
✅ PermissionFlagsBits.Administrator
✅ PermissionFlagsBits.ManageChannels
✅ member.permissions.has(PermissionFlagsBits.Administrator)
❌ NOT: 'ADMINISTRATOR' strings or Permissions.FLAGS

**Roles (v14):**
✅ member.roles.add(roleId)
✅ member.roles.remove(roleId)
✅ member.roles.cache.has(roleId)
❌ NOT: member.addRole() or member.removeRole()

**Channels (v14):**
✅ guild.channels.create({ name: 'channel-name', type: ChannelType.GuildText })
✅ guild.channels.create({ name: 'voice', type: ChannelType.GuildVoice })  
✅ guild.channels.create({ name: 'text', type: ChannelType.GuildText, parent: channel.parentId })
✅ channel.setName('name')
✅ channel.setPosition(number)
✅ channel.setParent(categoryId)
✅ channel.permissionOverwrites.edit(target, { ViewChannel: true })
✅ guild.channels.cache.get(id) or guild.channels.fetch(id)
❌ NOT: channel.updateOverwrite()
❌ NOT: type: 'text' or type: 0 (use ChannelType enum!)

**CRITICAL FOR CREATING CHANNELS:**
- ALWAYS use ChannelType.GuildText for text channels
- ALWAYS use ChannelType.GuildVoice for voice channels
- ALWAYS use ChannelType.GuildCategory for categories
- If user says "in this category", use: parent: channel.parentId
- If user says "create channel named X", X is the name!

**Messages (v14):**
✅ channel.send({ content: 'text', embeds: [embed] })
✅ message.reply({ content: 'text' })
✅ channel.messages.fetch(messageId)
❌ NOT: channel.send('text') without options object for complex messages

**Members (v14):**
✅ guild.members.cache.get(id) or guild.members.fetch(id)
✅ member.timeout(duration, reason) // For timeout/mute
✅ member.ban({ reason: 'reason' })
✅ member.kick('reason')
❌ NOT: member.ban('reason') with string directly

**Voice (v14):**
✅ member.voice.channel
✅ member.voice.setChannel(channelId)
✅ voiceChannel.members.size
❌ NOT: member.voiceChannel

${contextDescription}

**User Request:** ${userRequest}

**Example 1 - "give me admin role" (NO PERMISSION CHECKS):**
try {
    const targetMember = guild.members.cache.get('${context.userId}');
    const adminRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('admin'));
    if (!adminRole) return { success: false, message: 'Could not find admin role', action: 'role_add', target: 'none' };
    await targetMember.roles.add(adminRole);
    return { success: true, message: \`✅ Gave \${adminRole.name} role to <@\${targetMember.id}>\`, action: 'role_add', target: targetMember.id };
} catch (error) {
    return { success: false, message: 'Error: ' + error.message, action: 'role_add', target: 'unknown' };
}

**Example 2 - "create a text channel called test" (CORRECT v14 SYNTAX):**
try {
    const newChannel = await guild.channels.create({
        name: 'test',
        type: ChannelType.GuildText
    });
    return { success: true, message: \`✅ Created text channel <#\${newChannel.id}>\`, action: 'channel_create', target: newChannel.id };
} catch (error) {
    return { success: false, message: 'Error: ' + error.message, action: 'channel_create', target: 'unknown' };
}

**Example 3 - "create a text channel named test in this category" (WITH PARENT):**
try {
    const newChannel = await guild.channels.create({
        name: 'test',
        type: ChannelType.GuildText,
        parent: channel.parentId
    });
    return { success: true, message: \`✅ Created text channel <#\${newChannel.id}> in this category\`, action: 'channel_create', target: newChannel.id };
} catch (error) {
    return { success: false, message: 'Error: ' + error.message, action: 'channel_create', target: 'unknown' };
}

**Example 4 - "move channel to position 5":**
try {
    await channel.setPosition(5);
    return { success: true, message: \`✅ Moved <#\${channel.id}> to position 5\`, action: 'channel_move', target: channel.id };
} catch (error) {
    return { success: false, message: 'Error: ' + error.message, action: 'channel_move', target: channel.id };
}

IMPORTANT: Generate COMPLETE, syntactically correct code. Always return detailed success/error messages with WHO/WHAT was affected!

Generate the code now:`;

            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    {
                        role: "system",
                        content: "You are a code generator. Output ONLY executable JavaScript code with NO markdown, NO explanations, NO function wrappers. Just the raw code body that can be executed directly."
                    },
                    { role: "user", content: prompt }
                ],
                max_tokens: 1000,
                temperature: 0.3
            });

            let generatedCode = response.choices[0].message.content.trim();

            // Remove markdown code blocks if present
            generatedCode = generatedCode.replace(/```(?:javascript|js)?\n?/g, '').replace(/```$/g, '');

            // Remove any async function wrappers
            generatedCode = generatedCode.replace(/^async\s+function\s*\([^)]*\)\s*\{/g, '');
            generatedCode = generatedCode.replace(/\}$/g, '');

            // Fix incomplete code - count braces and add missing closing braces
            const openBraces = (generatedCode.match(/\{/g) || []).length;
            const closeBraces = (generatedCode.match(/\}/g) || []).length;
            const missingBraces = openBraces - closeBraces;

            if (missingBraces > 0) {
                console.log(`⚠️ AI generated incomplete code. Adding ${missingBraces} missing closing brace(s)`);
                generatedCode += '\n' + '}'.repeat(missingBraces);
            }

            return {
                code: generatedCode.trim(),
                request: userRequest,
                intent
            };

        } catch (error) {
            console.error('Code Generation Error:', error);
            throw new Error(`Failed to generate code: ${error.message}`);
        }
    }

    /**
     * Execute AI-generated code in a sandboxed environment
     */
    async executeCode(code, message, context = {}) {
        // Validate code first
        const validation = this.validateCode(code);
        if (!validation.safe) {
            return {
                success: false,
                error: 'Security validation failed',
                issues: validation.issues
            };
        }

        try {
            // Import Discord.js v14 components
            const {
                EmbedBuilder,
                ActionRowBuilder,
                ButtonBuilder,
                ButtonStyle,
                PermissionFlagsBits,
                ChannelType
            } = require('discord.js');

            // Create sandbox with limited scope
            const vm = new VM({
                timeout: 5000, // 5 second timeout
                sandbox: {
                    message,
                    guild: message.guild,
                    channel: message.channel,
                    user: message.author,
                    client: message.client,
                    entities: context.entities || {},
                    // Discord.js v14 builders and enums
                    EmbedBuilder,
                    ActionRowBuilder,
                    ButtonBuilder,
                    ButtonStyle,
                    PermissionFlagsBits,
                    ChannelType,
                    console: {
                        log: (...args) => console.log('[Sandboxed Code]:', ...args),
                        error: (...args) => console.error('[Sandboxed Code Error]:', ...args)
                    }
                }
            });

            // Wrap code in async IIFE
            const wrappedCode = `
                (async () => {
                    ${code}
                })()
            `;

            // Execute in sandbox
            const result = await vm.run(wrappedCode);

            return {
                success: true,
                result
            };

        } catch (error) {
            console.error('Code Execution Error:', error);
            return {
                success: false,
                error: error.message,
                stack: error.stack
            };
        }
    }

    /**
     * Create confirmation buttons for dangerous actions
     */
    createConfirmationButtons(confirmId) {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`confirm_${confirmId}`)
                    .setLabel('✅ Confirm')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`cancel_${confirmId}`)
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );
        return row;
    }

    /**
     * Main entry point: Generate and execute code for a user request
     */
    async handleRequest(userRequest, message, context = {}) {
        // Permission check
        if (!this.hasPermission(message.author.id, message)) {
            return {
                success: false,
                error: 'You do not have permission to use AI code execution.',
                permissionRequired: true
            };
        }

        try {
            // Step 1: Generate code
            const { code, request, intent } = await this.generateCode(userRequest, {
                ...context,
                guildId: message.guild?.id,
                channelId: message.channel.id,
                userId: message.author.id,
                replyContext: context.replyContext
            });

            console.log('Generated Code:', code);
            console.log('Parsed Intent:', intent);

            // Step 2: Check if confirmation is required (safety check, not permission check)
            const confirmCheck = this.requiresConfirmation(code, intent);

            if (confirmCheck.needsConfirmation) {
                const confirmId = `${message.author.id}_${Date.now()}`;

                this.pendingConfirmations.set(confirmId, {
                    code,
                    message,
                    context,
                    request,
                    intent,
                    timestamp: Date.now()
                });

                // Create confirmation embed with specific reasons
                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('⚠️ Confirmation Required')
                    .setDescription('This action is potentially destructive:')
                    .addFields(
                        { name: '📝 Your Request', value: `\`${request}\`` },
                        { name: '🎯 Target', value: intent.targetName || 'Unknown', inline: true },
                        { name: '⚠️ Action Involves', value: confirmCheck.reasons.join('\n'), inline: false },
                        { name: '⏰ Expires', value: '<t:' + Math.floor((Date.now() + 30000) / 1000) + ':R>' }
                    )
                    .setFooter({ text: 'Click Confirm to proceed or Cancel to abort' })
                    .setTimestamp();

                const buttons = this.createConfirmationButtons(confirmId);

                // Auto-cancel after 30 seconds
                setTimeout(() => {
                    if (this.pendingConfirmations.has(confirmId)) {
                        this.pendingConfirmations.delete(confirmId);
                    }
                }, 30000);

                return {
                    needsConfirmation: true,
                    confirmId,
                    embed,
                    buttons,
                    reasons: confirmCheck.reasons
                };
            }

            // Step 3: Execute code immediately (no confirmation needed)
            const executionResult = await this.executeCode(code, message, context);

            return {
                ...executionResult,
                generatedCode: code,
                request,
                intent
            };

        } catch (error) {
            console.error('Request Handling Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Handle confirmation button click
     */
    async handleConfirmation(interaction, confirmed) {
        const confirmId = interaction.customId.replace('confirm_', '').replace('cancel_', '');
        const pending = this.pendingConfirmations.get(confirmId);

        if (!pending) {
            return interaction.reply({ content: '❌ This confirmation has expired.', ephemeral: true });
        }

        // Check if the person clicking is the person who initiated
        if (interaction.user.id !== pending.message.author.id) {
            return interaction.reply({ content: '❌ Only the person who initiated this can confirm.', ephemeral: true });
        }

        this.pendingConfirmations.delete(confirmId);

        if (!confirmed) {
            await interaction.update({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('❌ Cancelled')
                        .setDescription('Action cancelled by user')
                        .setTimestamp()
                ],
                components: []
            });
            return { cancelled: true };
        }

        // Execute the code
        await interaction.update({
            embeds: [
                new EmbedBuilder()
                    .setColor('#ffff00')
                    .setTitle('⏳ Executing...')
                    .setDescription('Please wait...')
            ],
            components: []
        });

        const executionResult = await this.executeCode(pending.code, pending.message, pending.context);

        return {
            ...executionResult,
            generatedCode: pending.code,
            request: pending.request,
            intent: pending.intent,
            interaction
        };
    }

    /**
     * Test mode: Generate code but don't execute (for debugging)
     */
    async dryRun(userRequest, message, context = {}) {
        try {
            const { code, request, intent } = await this.generateCode(userRequest, {
                ...context,
                guildId: message.guild?.id,
                channelId: message.channel.id,
                userId: message.author.id,
                replyContext: context.replyContext
            });
            const validation = this.validateCode(code);
            const confirmCheck = this.requiresConfirmation(code);

            return {
                code,
                request,
                intent,
                validation,
                wouldExecute: validation.safe,
                needsConfirmation: confirmCheck.needsConfirmation,
                confirmationReasons: confirmCheck.reasons
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new AICodeExecutor();