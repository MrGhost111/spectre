const { HfInference } = require('@huggingface/inference');
require('dotenv').config();

// Define all AI-parseable commands with their metadata
const AI_COMMAND_DEFINITIONS = [
    {
        name: 'adminperms',
        aliases: ['admin', 'giveadmin', 'toggleadmin'],
        description: 'Toggle admin permissions for designated role (owner only)',
        keywords: ['admin', 'perms', 'permissions', 'administrator', 'give', 'toggle', 'remove'],
        requiredParams: [],
        examples: [
            'give me admin perms',
            'toggle admin permissions',
            'remove my admin',
            'grant me administrator'
        ]
    },
    {
        name: 'unmute',
        aliases: ['removemute', 'unsilence'],
        description: 'Remove muted role from a user (restricted access)',
        keywords: ['unmute', 'remove mute', 'unsilence', 'unmuted', 'take off mute', 'lift mute'],
        requiredParams: [],
        examples: [
            'unmute @user',
            'unmute me',
            'remove mute from john',
            'unsilence that person',
            'take the mute off',
            'unmute the user I replied to'
        ]
    },
    {
        name: 'stfu',
        aliases: ['shut', 'quiet', 'chill', 'silence', 'mute'],
        description: 'Attempt to mute a user with luck-based system (requires specific roles)',
        keywords: ['stfu', 'shut', 'quiet', 'chill', 'silence', 'mute', 'shut up', 'be quiet', 'stop talking'],
        requiredParams: [],
        examples: [
            'stfu @user',
            'shut up john',
            'mute that person',
            'tell them to be quiet',
            'silence this guy',
            'make them shut up'
        ]
    },
    {
        name: 'resetcd',
        aliases: ['resetcooldown', 'cdrest'],
        description: 'Reset your stfu command cooldown',
        keywords: ['reset', 'cooldown', 'cd', 'reset cooldown', 'clear cooldown'],
        requiredParams: [],
        examples: [
            'reset my cooldown',
            'reset cd',
            'clear my cooldown',
            'resetcd'
        ]
    },
    {
        name: 'addfriends',
        aliases: ['addchannel', 'addvc', 'addpeople', 'addfriend'],
        description: 'Add friends to your donor voice channel',
        keywords: ['add', 'friends', 'channel', 'vc', 'voice', 'people', 'invite', 'grant access'],
        requiredParams: [],
        examples: [
            'add @user1 @user2 to my channel',
            'add friends to vc',
            'invite john and sarah to my channel',
            'give @user access to my vc',
            'add these people to channel'
        ]
    }
];

class AICommandParser {
    constructor() {
        this.hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
    }

    /**
     * Parse natural language message to extract command(s) and parameters
     */
    async parseCommand(userMessage, context = {}) {
        try {
            const commandList = AI_COMMAND_DEFINITIONS.map(cmd => ({
                name: cmd.name,
                description: cmd.description,
                keywords: cmd.keywords,
                examples: cmd.examples
            }));

            const prompt = `You are a Discord bot command parser. Analyze the user's message and determine which command(s) they want to execute.

Available commands:
${JSON.stringify(commandList, null, 2)}

User message: "${userMessage}"

Rules:
1. If the user wants to execute ONE command, return single command format
2. If the user wants to execute MULTIPLE commands (using "and", "then", etc.), return multiple commands format
3. Commands should be executed in the order they appear in the message
4. If no command matches, return {"command": "unknown"}
5. Respond with ONLY valid JSON, nothing else

Single command response format:
{
  "command": "command_name",
  "confidence": "high/medium/low",
  "reasoning": "brief explanation"
}

Multiple commands response format:
{
  "multipleCommands": true,
  "commands": [
    {"command": "command_name_1", "order": 1},
    {"command": "command_name_2", "order": 2}
  ],
  "confidence": "high/medium/low",
  "reasoning": "brief explanation"
}

Examples:
- "reset cd and mute john" → multiple commands: resetcd first, then stfu
- "mute this guy" → single command: stfu
- "reset my cooldown then shut up @user" → multiple commands: resetcd first, then stfu`;

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

                // Handle multiple commands
                if (parsed.multipleCommands && parsed.commands) {
                    // Validate all commands exist
                    const validCommands = parsed.commands
                        .filter(cmdInfo => {
                            const commandDef = AI_COMMAND_DEFINITIONS.find(cmd =>
                                cmd.name === cmdInfo.command
                            );
                            return commandDef !== undefined;
                        })
                        .sort((a, b) => (a.order || 0) - (b.order || 0)); // Sort by order

                    if (validCommands.length > 0) {
                        return {
                            ...parsed,
                            commands: validCommands,
                            success: true
                        };
                    }
                }

                // Handle single command
                const commandDef = AI_COMMAND_DEFINITIONS.find(cmd => cmd.name === parsed.command);
                if (commandDef) {
                    return {
                        ...parsed,
                        commandDef,
                        success: true
                    };
                }
            }

            return {
                command: 'unknown',
                confidence: 'low',
                reasoning: 'Could not match to any command',
                success: false
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
            cmd.name === commandName || cmd.aliases.includes(commandName)
        );
    }

    /**
     * Check if a command is registered for AI parsing
     */
    isAICommand(commandName) {
        return AI_COMMAND_DEFINITIONS.some(cmd =>
            cmd.name === commandName || cmd.aliases.includes(commandName)
        );
    }
}

module.exports = new AICommandParser();