const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Displays a list of available commands.'),
    async execute(interaction) {
        const isAdmin = interaction.member.permissions.has('ADMINISTRATOR');

        // Define normal and admin commands manually
        const normalCommands = [
            { name: '</mychannel:1277512176717791281> or `,myc`', description: 'Manage your channel' },
            { name: '</addfriends:1277512176717791278>', description: 'Add friends to your channel' },
            { name: '</removefriends:1277512176717791282>', description: 'Remove friends from your channel' }
        ];

        const adminCommands = [
            { name: '`,deadchannels`', description: 'Admin command to list channels whose owners are no longer in the server.' },
            { name: '`,seechannels`', description: 'Admin command to list all channels an admin user is part of.' },
            { name: '`,viewchannel`', description: 'Admin command to view channel info.' },
            { name: '</assign:1277512176717791279>', description: 'Admin command to assign "CURRENT" channel to user' }
        ];


        // Create embed to display the commands
        const embed = new EmbedBuilder()
            .setTitle('Available Commands')
            .setColor(Colors.Blue)
            .setDescription('Here is a list of available commands you can use:')
            .addFields(
                { name: 'Normal Commands', value: normalCommands.map(cmd => `**${cmd.name}**: ${cmd.description}`).join('\n') || 'None' }
            );

        if (isAdmin) {
            embed.addFields(
                { name: 'Admin Commands', value: adminCommands.map(cmd => `**${cmd.name}**: ${cmd.description}`).join('\n') || 'None' }
            );
        }

        await interaction.reply({ embeds: [embed] });
    }
};
