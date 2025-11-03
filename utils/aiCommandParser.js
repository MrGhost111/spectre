const { HfInference } = require('@huggingface/inference');
const discordEntityParser = require('./discordEntityParser');
const dataManager = require('./dataManager');
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

class AICommandParser {
    constructor() {
        this.hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
        this.entityParser = discordEntityParser;
        this.dataManager = dataManager;
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
     * Parse natural language message to extract command(s) and parameters
     */
    async parseCommand(userMessage, message, context = {}) {
        try {
            // First, analyze if this is a command or chat
            const intentAnalysis = await this.analyzeIntent(userMessage, context);

            // If it's clearly chat with high confidence, return chat intent
            if (intentAnalysis.intent === 'chat' && intentAnalysis.confidence === 'high') {
                return {
                    isChat: true,
                    confidence: intentAnalysis.confidence,
                    reasoning: intentAnalysis.reasoning
                };
            }

            // Parse entities from the Discord message (this will clean the message internally)
            const entities = await this.entityParser.parseMessage(message);

            console.log('Parsed Entities:', {
                users: entities.users.map(u => u.username),
                roles: entities.roles.map(r => r.name),
                channels: entities.channels.map(c => c.name)
            });

            // Try to parse as command
            const commandList = AI_COMMAND_DEFINITIONS.map(cmd => ({
                name: cmd.name,
                description: cmd.description,
                keywords: cmd.keywords,
                requiredEntities: cmd.requiredEntities || []
            }));

            const prompt = `You are a Discord bot command parser. Analyze the user's message and determine which command(s) they want to execute.

Available commands:
${JSON.stringify(commandList, null, 2)}

User message: "${userMessage}"

Detected entities:
- Users: ${entities.users.map(u => u.username).join(', ') || 'none'}
- Roles: ${entities.roles.map(r => r.name).join(', ') || 'none'}
- Channels: ${entities.channels.map(c => c.name).join(', ') || 'none'}

Context:
- The word "spectre" is a trigger word and should NOT be considered as a user or role
- For "give/remove role" commands: identify the role and user from detected entities
- For "add/remove from channel": identify users and channels from detected entities
- Multiple commands are separated by "and", "then", or similar conjunctions

Rules:
1. If ONE command, return single command format
2. If MULTIPLE commands (using "and", "then"), return multiple commands format
3. Commands execute in message order
4. If no clear command, return {"command": "unknown"}
5. Use the detected entities to understand what the command is acting on
6. Respond with ONLY valid JSON

Single command:
{
  "command": "command_name",
  "confidence": "high/medium/low",
  "reasoning": "brief explanation"
}

Multiple commands:
{
  "multipleCommands": true,
  "commands": [
    {"command": "command_name_1", "order": 1},
    {"command": "command_name_2", "order": 2}
  ],
  "confidence": "high/medium/low"
}`;

            const response = await this.hf.chatCompletion({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                    { role: "system", content: "You are a command parser. Respond only with JSON. Never consider 'spectre' as a user or role name." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 400,
                temperature: 0.2
            });

            const aiResponse = response.choices[0].message.content;
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);

                // Handle multiple commands
                if (parsed.multipleCommands && parsed.commands) {
                    const validCommands = parsed.commands
                        .filter(cmdInfo => {
                            const commandDef = AI_COMMAND_DEFINITIONS.find(cmd =>
                                cmd.name === cmdInfo.command
                            );
                            return commandDef !== undefined;
                        })
                        .sort((a, b) => (a.order || 0) - (b.order || 0));

                    if (validCommands.length > 0) {
                        return {
                            ...parsed,
                            commands: validCommands,
                            entities,
                            success: true,
                            isChat: false
                        };
                    }
                }

                // Handle single command
                const commandDef = AI_COMMAND_DEFINITIONS.find(cmd => cmd.name === parsed.command);
                if (commandDef && parsed.confidence !== 'low') {
                    return {
                        ...parsed,
                        commandDef,
                        entities,
                        success: true,
                        isChat: false
                    };
                }
            }

            // If command parsing failed or confidence is low, treat as chat
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
                isChat: false
            };
        } catch (error) {
            console.error('AI Parsing Error:', error);
            throw error;
        }
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

module.exports = new AICommandParser();