const axios = require("axios");
require("dotenv").config();

module.exports = {
    name: "nlp",
    async execute(client, message) {
        if (message.author.bot || !message.mentions.has(client.user)) return;

        const userMessage = message.content;

        // Enhanced prompt for better inference
        const prompt = `
            You are an assistant for Discord bot commands. Analyze the following message: "${userMessage}"
            Identify:
            1. The action to be performed: "add" or "remove."
            - Adding users might be expressed as "add," "invite," "grant access," "include," or similar.
            - Removing users might be expressed as "remove," "kick," "exclude," "revoke access," or similar.
            2. The user(s) mentioned in the message. Users are tagged as <@user_id> or mentioned by their username, e.g., "@username."
            3. The channel mentioned in the message. Channels are tagged as <#channel_id> or referenced by their name, e.g., "#channelname."

            Based on your analysis, respond with one of the following formats:
            - "add @username to #channelname"
            - "remove @username from #channelname"

            Do not include any extra text or explanations. If you cannot determine the action, reply with "unknown."
        `;

        const apiURL = "https://us-central1-aiplatform.googleapis.com/v1/projects/elegant-shelter-443900-c2/locations/us-central1/publishers/google/models/gemini-1.5:predict"; // Update with your Vertex endpoint
        const requestBody = {
            instances: [
                {
                    content: prompt,
                },
            ],
            parameters: {
                maxOutputTokens: 128,
                temperature: 0.7,
                topP: 0.9,
            },
        };

        try {
            const response = await axios.post(apiURL, requestBody, {
                headers: {
                    "Authorization": `Bearer ${process.env.GOOGLE_API_KEY}`,
                    "Content-Type": "application/json",
                },
            });

            const botReply = response.data.predictions[0].content.trim(); // Extract the generated response

            // Extract mentioned user(s) and channel from the message
            const userMentions = message.mentions.users.filter(user => user.id !== client.user.id);
            const channelMentions = message.mentions.channels;

            if (botReply === "unknown" || userMentions.size === 0 || channelMentions.size !== 1) {
                await message.channel.send(
                    "I couldn't determine the action, user, or channel. Please try again with more explicit details."
                );
                return;
            }

            const channelToModify = channelMentions.first();
            const action = botReply.includes("add") ? "add" : "remove";
            const color = action === "add" ? 0x00FF00 : 0xFF0000; // Green for add, Red for remove

            for (const user of userMentions.values()) {
                console.log(`${action}ing user ${user.tag} to/from channel ${channelToModify.name}`);
                await message.channel.send({
                    embeds: [
                        {
                            title: `User ${action}ed`,
                            description: `${action === "add" ? "Adding" : "Removing"} ${user} ${
                                action === "add" ? "to" : "from"
                            } ${channelToModify}`,
                            color: color,
                        },
                    ],
                });
            }
        } catch (error) {
            console.error("Error with Vertex AI API:", error.response?.data || error.message);
            await message.channel.send("There was an error processing your request.");
        }
    },
};
