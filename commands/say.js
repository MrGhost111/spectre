const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Send a message through the bot (Admin only)')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The message to send')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to send the message in (optional)')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        // Get the message content
        let message = interaction.options.getString('message');
        
        // Remove any role or everyone/here mentions
        message = message.replace(/@(everyone|here|&\d+)/g, '@\u200b$1');
        
        // Get the target channel or use the current channel
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        
        try {
            // Send the message
            await channel.send(message);
            
            // Reply to the interaction (ephemeral so only the command user sees it)
            await interaction.reply({ 
                content: `Message sent successfully in ${channel}!`,
                ephemeral: true 
            });
        } catch (error) {
            await interaction.reply({ 
                content: 'Failed to send the message. Please check my permissions in the target channel.',
                ephemeral: true 
            });
        }
    }
};
