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
            const prompt = `You are a Discord.js bot code generator. Generate ONLY executable JavaScript code based on the user's request.

**CRITICAL RULES:**
1. Generate ONLY the function body code - NO function declarations, NO exports, NO comments
2. Use ONLY these available objects:
   - message (Discord.js Message object)
   - guild (Discord.js Guild object)
   - channel (Discord.js Channel object)
   - user (Discord.js User object)
   - client (Discord.js Client object)
   - entities (object with users, roles, channels arrays)
3. Use async/await for all Discord operations
4. Return a result object: { success: true/false, message: "response" }
5. Handle all errors with try-catch
6. DO NOT use: require(), import, process, fs, child_process, eval, Function
7. DO NOT access environment variables or tokens
8. Use discord.js v14 syntax
9. For channel positioning: use channel.setPosition(number) where 0 is top
10. For channel moving: use channel.setParent(categoryId) to change category

**Available Context:**
- Guild ID: ${context.guildId}
- Channel ID: ${context.channelId}
- User ID: ${context.userId}
- Detected entities: ${JSON.stringify(context.entities || {})}

**User Request:** ${userRequest}

**Example Output Format:**
try {
    const targetChannel = guild.channels.cache.get('123456789');
    await targetChannel.setPosition(0);
    return { success: true, message: 'Channel moved to top' };
} catch (error) {
    return { success: false, message: 'Error: ' + error.message };
}

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