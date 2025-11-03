const { HfInference } = require('@huggingface/inference');
const discordEntityParser = require('./discordEntityParser');
const aiCodeExecutor = require('./aiCodeExecutor');
require('dotenv').config();

// Define all AI-parseable commands with their metadata
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
        name: 'resetcd',
        aliases: ['resetcooldown', 'cdrest'],
        description: 'Reset your stfu command cooldown',
        keywords: ['reset', 'cooldown', 'cd', 'reset cooldown', 'clear cooldown'],
        category: 'utility'
    },
    {
        name: 'addfriends',
        aliases: ['addchannel', 'addvc', 'addpeople', 'addfriend'],
        description: 'Add friends to your donor voice channel',
        keywords: ['add', 'friends', 'channel', 'vc', 'voice', 'people', 'invite', 'grant access'],
        category: 'channel'
    },
    {
        name: 'removefriends',
        aliases: ['removechannel', 'removevc', 'removepeople', 'removefriend', 'kickfriend'],
        description: 'Remove friends from your donor voice channel',
        keywords: ['remove', 'kick', 'friends', 'channel', 'vc', 'voice', 'people', 'revoke access', 'take away'],
        category: 'channel'
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
    {
        name: 'viewlock',
        aliases: ['hideuser', 'blockview', 'restrictview'],
        description: 'Prevent a user from viewing a channel',
        keywords: ['viewlock', 'hide', 'block', 'restrict', 'view', 'prevent', 'cant see'],
        category: 'moderation',
        requiredEntities: ['user', 'channel']
    },
    {
        name: 'addtochannel',
        aliases: ['grantaccess', 'allowinchannel'],
        description: 'Add user or role to channel permissions',
        keywords: ['add', 'channel', 'grant', 'allow', 'access', 'permission'],
        category: 'moderation',
        requiredEntities: ['channel']
    },
    {
        name: 'removefromchannel',
        aliases: ['revokeaccess', 'denyinchannel'],
        description: 'Remove user or role from channel permissions',
        keywords: ['remove', 'channel', 'revoke', 'deny', 'access', 'permission'],
        category: 'moderation',
        requiredEntities: ['channel']
    },
    {
        name: 'movechannel',
        aliases: ['changecategory', 'relocate'],
        description: 'Move a channel to a different category',
        keywords: ['move', 'channel', 'category', 'relocate', 'change', 'position'],
        category: 'moderation',
        requiredEntities: ['channel']
    },
    {
        name: 'createchannel',
        aliases: ['newchannel', 'makechannel'],
        description: 'Create a new channel',
        keywords: ['create', 'new', 'make', 'channel'],
        category: 'moderation'
    },
    {
        name: 'getdata',
        aliases: ['fetchdata', 'showdata', 'querydata'],
        description: 'Query database information',
        keywords: ['get', 'fetch', 'show', 'data', 'database', 'info', 'check', 'who allowed', 'when'],
        category: 'utility'
    }
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
     * Determine if message is a command or just chat
     */
    async analyzeIntent(userMessage, context = {}) {
        try {
            const commandKeywords = AI_COMMAND_DEFINITIONS.flatMap(cmd => cmd.keywords);
            const hasCommandKeyword = commandKeywords.some(keyword =>
                userMessage.toLowerCase().includes(keyword)
            );

            // Quick heuristics
            if (hasCommandKeyword) {
                return { intent: 'command', confidence: 'high', reasoning: 'Contains command keywords' };
            }

            const prompt = `You are a Discord bot intent analyzer. Determine if the user wants to:
1. Execute a command/action (like adding someone, giving roles, querying data, etc.)
2. Just have a casual conversation

User message: "${userMessage}"

Respond with ONLY valid JSON:
{
  "intent": "command" or "chat",
  "confidence": "high/medium/low",
  "reasoning": "brief explanation"
}`;

            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    { role: "system", content: "You are an intent analyzer. Respond only with JSON." },
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

            return { intent: 'chat', confidence: 'low', reasoning: 'Could not parse intent' };
        } catch (error) {
            console.error('Intent Analysis Error:', error);
            return { intent: 'chat', confidence: 'low', reasoning: 'Error occurred' };
        }
    }

    /**
     * Extract context from message replies and references
     */
    async extractReplyContext(message) {
        const context = {
            hasReply: false,
            repliedMessage: null,
            repliedUser: null,
            repliedContent: null
        };

        // Check if message is a reply
        if (message.reference && message.reference.messageId) {
            try {
                const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                if (repliedMessage) {
                    context.hasReply = true;
                    context.repliedMessage = repliedMessage;
                    context.repliedUser = repliedMessage.author;
                    context.repliedContent = repliedMessage.content;
                }
            } catch (error) {
                console.error('Error fetching replied message:', error);
            }
        }

        return context;
    }

    /**
     * Main parsing method with code execution fallback
     */
    async parseCommand(userMessage, message, context = {}) {
        try {
            // Extract reply context first
            const replyContext = await this.extractReplyContext(message);

            // If user is asking about "this" or "that" and replied to a message, add context
            let enrichedMessage = userMessage;
            if (replyContext.hasReply) {
                const vagueWords = ['this', 'that', 'it', 'what', 'who', 'them', 'they'];
                const hasVagueReference = vagueWords.some(word =>
                    userMessage.toLowerCase().includes(word)
                );

                if (hasVagueReference) {
                    enrichedMessage = `[User replied to a message from ${replyContext.repliedUser.username} that said: "${replyContext.repliedContent.slice(0, 200)}"] ${userMessage}`;
                    console.log('Enriched with reply context:', enrichedMessage);
                }
            }

            // First check if it's chat or command
            const intentAnalysis = await this.analyzeIntent(enrichedMessage, context);

            // If it's clearly chat with high confidence, return chat intent
            if (intentAnalysis.intent === 'chat' && intentAnalysis.confidence === 'high') {
                return {
                    isChat: true,
                    confidence: intentAnalysis.confidence,
                    reasoning: intentAnalysis.reasoning
                };
            }

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

Rules:
- "spectre" is a trigger word, NOT a user/role
- For "give/remove role": identify role and user from entities
- Multiple commands separated by "and", "then"

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

            // If command parsing failed but intent was command, treat as chat
            if (intentAnalysis.intent === 'chat') {
                return {
                    isChat: true,
                    confidence: 'medium',
                    reasoning: 'No clear command detected'
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

        // If it's chat, return that
        if (parseResult.isChat) {
            return {
                method: 'chat',
                ...parseResult
            };
        }

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

    /**
     * Get command definition by name
     */
    getCommandDefinition(commandName) {
        return AI_COMMAND_DEFINITIONS.find(cmd =>
            cmd.name === commandName || (cmd.aliases && cmd.aliases.includes(commandName))
        );
    }
}

module.exports = new EnhancedAICommandParser();