const { REST, Routes } = require('discord.js');
const fs = require('fs');
const express = require('express');
const { exec } = require('child_process');
require('dotenv').config();

// Express server for GitHub webhook
const app = express();
app.use(express.json());
const PORT = process.env.WEBHOOK_PORT || 3000;

// Discord bot configuration
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const token = process.env.DISCORD_TOKEN;
const rest = new REST({ version: '10' }).setToken(token);

// GitHub webhook endpoint
app.post('/webhook', (req, res) => {
    console.log('Received webhook from GitHub');
    
    // Execute git pull in the repository directory
    exec('cd /home/ubuntu/spectre && git pull origin main', (error, stdout, stderr) => {
        if (error) {
            console.error(`Git pull error: ${error}`);
            return res.status(500).send('Failed to pull updates');
        }
        
        console.log(`Git pull output: ${stdout}`);
        
        // If no changes, just respond
        if (stdout.includes('Already up to date')) {
            console.log('No changes to deploy');
            return res.status(200).send('No changes detected');
        }
        
        // Restart the Node.js process in the existing screen session
        exec(`screen -r "index.js" -X stuff "^C"`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Failed to send Ctrl+C to screen: ${error}`);
                return res.status(500).send('Failed to stop application');
            }
            
            // Wait a moment to ensure the process has stopped
            setTimeout(() => {
                // Start the application again
                exec(`screen -r "index.js" -X stuff "node index.js\\r"`, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Failed to restart application: ${error}`);
                        return res.status(500).send('Failed to restart application');
                    }
                    
                    console.log('Application restarted successfully');
                    res.status(200).send('Changes deployed successfully');
                });
            }, 2000);
        });
    });
});

// Function to deploy Discord commands (your original code)
async function deployCommands() {
    try {
        console.log('Started refreshing guild application (/) commands.');
        // Load all command files from the ./commands directory
        const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
        const commands = [];
        for (const file of commandFiles) {
            const command = require(`./commands/${file}`);
            if (command.data) {
                const commandData = typeof command.data.toJSON === 'function' ? command.data.toJSON() : command.data;
                commands.push(commandData);
            }
        }
        // Delete previously registered commands that are not needed anymore
        const currentCommands = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
        for (const command of currentCommands) {
            if (!commands.some(c => c.name === command.name)) {
                console.log(`Deleting guild command: ${command.name} with ID ${command.id}`);
                await rest.delete(Routes.applicationGuildCommand(clientId, guildId, command.id));
            }
        }
        // Deploy the updated set of commands to the specific guild
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands }
        );
        console.log('Successfully reloaded guild application (/) commands.');
    } catch (error) {
        console.error('Error reloading commands:', error);
    }
}

// Start the Express server and deploy Discord commands
app.listen(PORT, () => {
    console.log(`Webhook server running on port ${PORT}`);
    // Run the original command deployment functionality
    deployCommands();
});
