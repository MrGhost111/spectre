// JavaScript source code
module.exports = async function handleDeleteSnipe(interaction) {
    const message = interaction.message;

    const originalCommandMessage = await interaction.channel.messages.fetch({ limit: 100 }).then(messages =>
        messages.find(msg => msg.content.startsWith(',snipe') || msg.content.startsWith(',esnipe'))
    );

    if (!originalCommandMessage) {
        return interaction.reply({ content: 'Unable to verify the original command user.', ephemeral: true });
    }

    if (interaction.user.id !== originalCommandMessage.author.id) {
        return interaction.reply({ content: 'You are not allowed to delete this message.', ephemeral: true });
    }

    try {
        await message.delete();
        await originalCommandMessage.delete();
        await interaction.reply({ content: 'Deleted the snipe/esnipe message and the command.', ephemeral: true });
    } catch (error) {
        console.error(`Error deleting snipe message: ${error}`);
        await interaction.reply({ content: 'Failed to delete the message.', ephemeral: true });
    }
};