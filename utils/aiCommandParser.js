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
            'unmute the user I replied to',
            'unmute this guy'
        ]
    },
    // Add more commands here as we integrate them
];

class AICommandParser {
    constructor() {
        this.hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
    }

    /**
     * Parse natural language message to extract command and parameters
     */
    async parseCommand(userMessage, context = {}) {
        try {
            const commandList = AI_COMMAND_DEFINITIONS.map(cmd => ({
                name: cmd.name,
                description: cmd.description,
                keywords: cmd.keywords,
                examples: cmd.examples
            }));

            const prompt = `You are a Discord bot command parser. Analyze the user's message and determine which command they want to execute.

Available commands:
${JSON.stringify(commandList, null, 2)}

User message: "${userMessage}"

Rules:
1. Match the user's intent to ONE command from the list above
2. If no command matches, return {"command": "unknown"}
3. Respond with ONLY valid JSON, nothing else

Response format:
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
                max_tokens: 200,
                temperature: 0.2
            });

            const aiResponse = response.choices[0].message.content;
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);

                // Validate the command exists
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