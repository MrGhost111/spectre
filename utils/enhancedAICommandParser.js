const { HfInference } = require('@huggingface/inference');
const discordEntityParser = require('./discordEntityParser');
const aiCodeExecutor = require('./aiCodeExecutor');
require('dotenv').config();

// Your existing command definitions
const AI_COMMAND_DEFINITIONS = [
    {
        name: 'adminperms',
        aliases: ['admin', 'giveadmin', 'toggleadmin'],
        description: 'Toggle admin permissions for designated role (owner only)',
        keywords: ['admin', 'perms', 'permissions', 'administrator', 'give', 'toggle', 'remove'],
        category: 'moderation'
    },
    {
        name: 'unmute',
        aliases: ['removemute', 'unsilence'],
        description: 'Remove muted role from a user (restricted access)',
        keywords: ['unmute', 'remove mute', 'unsilence', 'unmuted', 'take off mute', 'lift mute'],
        category: 'moderation'
    },
    {
        name: 'stfu',
        aliases: ['shut', 'quiet', 'chill', 'silence', 'mute'],
        description: 'Attempt to mute a user with luck-based system',
        keywords: ['stfu', 'shut', 'quiet', 'chill', 'silence', 'mute', 'shut up', 'be quiet', 'stop talking'],
        category: 'fun'
    },
    {
        name: 'giverole',
        aliases: ['addrole', 'assignrole', 'grantrole'],
        description: 'Give a role to a user (requires permissions)',
        keywords: ['give', 'add', 'assign', 'grant', 'role'],
        category: 'moderation',
        requiredEntities: ['user', 'role']
    },
    {
        name: 'removerole',
        aliases: ['takerole', 'striprole', 'revokerole'],
        description: 'Remove a role from a user (requires permissions)',
        keywords: ['remove', 'take', 'strip', 'revoke', 'role'],
        category: 'moderation',
        requiredEntities: ['user', 'role']
    },
    // Add more commands...
];

class EnhancedAICommandParser {
    constructor() {
        this.hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
        this.entityParser = discordEntityParser;
        this.codeExecutor = aiCodeExecutor;
    }

    /**
     * Determine if request needs custom code execution or can use predefined commands
     */
    async analyzeComplexity(userMessage, context = {}) {
        try {
            const prompt = `Analyze if this Discord bot request can be handled by predefined commands or needs custom code execution.

Available predefined commands:
${AI_COMMAND_DEFINITIONS.map(cmd => `- ${cmd.name}: ${cmd.description}`).join('\n')}

User request: "${userMessage}"

Respond with ONLY valid JSON:
{
  "needsCustomCode": true/false,
  "reason": "brief explanation",
  "confidence": "high/medium/low"
}

Examples:
- "move channel to top of category" -> needsCustomCode: true (position manipulation not in commands)
- "give role to user" -> needsCustomCode: false (predefined giverole command exists)
- "rename channel and move it up 3 positions" -> needsCustomCode: true (complex multi-step operation)`;

            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    { role: "system", content: "You are a complexity analyzer. Respond only with JSON." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 150,
                temperature: 0.2
            });

            const aiResponse = response.choices[0].message.content;
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            return { needsCustomCode: false, reason: 'Could not determine', confidence: 'low' };
        } catch (error) {
            console.error('Complexity Analysis Error:', error);
            return { needsCustomCode: false, reason: 'Error occurred', confidence: 'low' };
        }
    }

    /**
     * Main parsing method with code execution fallback
     */
    async parseCommand(userMessage, message, context = {}) {
        try {
            // Parse entities first
            const entities = await this.entityParser.parseMessage(message);

            console.log('Parsed Entities:', {
                users: entities.users.map(u => u.username),
                roles: entities.roles.map(r => r.name),
                channels: entities.channels.map(c => c.name)
            });

            // Analyze if this needs custom code
            const complexityAnalysis = await this.analyzeComplexity(userMessage, context);

            console.log('Complexity Analysis:', complexityAnalysis);

            // If it needs custom code and user has permission
            if (complexityAnalysis.needsCustomCode && complexityAnalysis.confidence !== 'low') {
                return {
                    useCodeExecution: true,
                    complexity: complexityAnalysis,
                    entities,
                    userMessage
                };
            }

            // Otherwise, try to match to predefined commands
            const commandList = AI_COMMAND_DEFINITIONS.map(cmd => ({
                name: cmd.name,
                description: cmd.description,
                keywords: cmd.keywords,
                requiredEntities: cmd.requiredEntities || []
            }));

            const prompt = `You are a Discord bot command parser. Match the user's request to a predefined command.

Available commands:
${JSON.stringify(commandList, null, 2)}

User message: "${userMessage}"

Detected entities:
- Users: ${entities.users.map(u => u.username).join(', ') || 'none'}
- Roles: ${entities.roles.map(r => r.name).join(', ') || 'none'}
- Channels: ${entities.channels.map(c => c.name).join(', ') || 'none'}

Respond with ONLY valid JSON:
{
  "command": "command_name",
  "confidence": "high/medium/low",
  "reasoning": "brief explanation"
}`;

            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    { role: "system", content: "You are a command parser. Respond only with JSON." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 300,
                temperature: 0.2
            });

            const aiResponse = response.choices[0].message.content;
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const commandDef = AI_COMMAND_DEFINITIONS.find(cmd => cmd.name === parsed.command);

                if (commandDef && parsed.confidence !== 'low') {
                    return {
                        ...parsed,
                        commandDef,
                        entities,
                        success: true,
                        useCodeExecution: false
                    };
                }
            }

            // If no match found, suggest code execution for complex requests
            if (complexityAnalysis.needsCustomCode) {
                return {
                    useCodeExecution: true,
                    complexity: complexityAnalysis,
                    entities,
                    userMessage,
                    fallback: true
                };
            }

            return {
                command: 'unknown',
                confidence: 'low',
                reasoning: 'Could not match to any command',
                success: false,
                useCodeExecution: false
            };

        } catch (error) {
            console.error('AI Parsing Error:', error);
            throw error;
        }
    }

    /**
     * Execute either predefined command or generated code
     */
    async execute(userMessage, message, context = {}) {
        const parseResult = await this.parseCommand(userMessage, message, context);

        // Use code execution
        if (parseResult.useCodeExecution) {
            console.log('Using AI Code Execution...');

            const executionResult = await this.codeExecutor.handleRequest(
                userMessage,
                message,
                { ...context, entities: parseResult.entities }
            );

            return {
                method: 'code_execution',
                ...executionResult
            };
        }

        // Use predefined command
        if (parseResult.success && parseResult.command !== 'unknown') {
            return {
                method: 'predefined_command',
                ...parseResult
            };
        }

        // No match
        return {
            method: 'none',
            ...parseResult
        };
    }
}

module.exports = new EnhancedAICommandParser();// JavaScript source code
