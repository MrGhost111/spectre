const { VM } = require('vm2');
const { HfInference } = require('@huggingface/inference');
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
     * Generate code using AI based on user request
     */
    async generateCode(userRequest, context = {}) {
        try {
            const prompt = `You are a Discord.js v14 bot code generator. Generate ONLY executable JavaScript code based on the user's request.

**CRITICAL RULES:**
1. Generate ONLY the function body code - NO function declarations, NO exports, NO comments
2. Use ONLY these available objects:
   - message (Discord.js Message object)
   - guild (Discord.js Guild object)
   - channel (Discord.js Channel object - this is where you send messages!)
   - user (Discord.js User object)
   - client (Discord.js Client object)
   - entities (object with users, roles, channels arrays)
   - EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits (ALREADY IMPORTED)
3. Use async/await for all Discord operations
4. Return a result object: { success: true/false, message: "response" }
5. Handle all errors with try-catch
6. DO NOT use: require(), import, process, fs, child_process, eval, Function
7. DO NOT access environment variables or tokens
8. ALWAYS close all braces properly - verify your code is syntactically complete

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
✅ channel.setName('name')
✅ channel.setPosition(number)
✅ channel.setParent(categoryId)
✅ channel.permissionOverwrites.edit(target, { ViewChannel: true })
✅ guild.channels.cache.get(id) or guild.channels.fetch(id)
❌ NOT: channel.updateOverwrite()

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

**Available Context:**
- Guild ID: ${context.guildId}
- Channel ID: ${context.channelId}
- User ID: ${context.userId}
- Current channel object: 'channel' variable
- Detected entities: ${JSON.stringify(context.entities || {})}

**User Request:** ${userRequest}

**Example 1 - Send Embed:**
try {
    const embed = new EmbedBuilder()
        .setTitle('Hello')
        .setDescription('World')
        .setColor('#00ff00');
    await channel.send({ embeds: [embed] });
    return { success: true, message: 'Embed sent' };
} catch (error) {
    return { success: false, message: 'Error: ' + error.message };
}

**Example 2 - Give Role:**
try {
    const member = guild.members.cache.get('123456789');
    const role = guild.roles.cache.get('987654321');
    await member.roles.add(role);
    return { success: true, message: 'Role added' };
} catch (error) {
    return { success: false, message: 'Error: ' + error.message };
}

**Example 3 - Edit Permissions:**
try {
    const targetChannel = guild.channels.cache.get('123456789');
    const targetMember = guild.members.cache.get('987654321');
    await targetChannel.permissionOverwrites.edit(targetMember, {
        ViewChannel: true,
        SendMessages: true
    });
    return { success: true, message: 'Permissions updated' };
} catch (error) {
    return { success: false, message: 'Error: ' + error.message };
}

IMPORTANT: Use ONLY v14 syntax. Generate COMPLETE, syntactically correct code. Count your braces!

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
                max_tokens: 800,
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
                request: userRequest
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
                PermissionFlagsBits
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
            await message.channel.sendTyping();

            const { code, request } = await this.generateCode(userRequest, {
                ...context,
                guildId: message.guild?.id,
                channelId: message.channel.id,
                userId: message.author.id
            });

            console.log('Generated Code:', code);

            // Step 2: Execute code
            const executionResult = await this.executeCode(code, message, context);

            return {
                ...executionResult,
                generatedCode: code,
                request
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
     * Test mode: Generate code but don't execute (for debugging)
     */
    async dryRun(userRequest, message, context = {}) {
        try {
            const { code, request } = await this.generateCode(userRequest, context);
            const validation = this.validateCode(code);

            return {
                code,
                request,
                validation,
                wouldExecute: validation.safe
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