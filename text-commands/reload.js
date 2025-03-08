const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

function setupHotReload(client) {
    // Create a reload command that only the bot owner can use
    client.textCommands.set('reload', {
        name: 'reload',
        description: 'Reloads commands, events, or all modules',
        execute: async (message, args) => {
            // Check if user is bot owner
            if (message.author.id !== '753491023208120321') {
                return message.reply('funny');
            }

            const target = args[0]?.toLowerCase();

            if (!target || target === 'all') {
                message.channel.send(`<:embed:869120964158451762> Reloading the fabric of reality... <:wait:1043139154298544238>`);
                await reloadAll(client);
                return message.reply('<:GreenTick:864757985917665300> All systems rebooted and ready to rumble!');
            } else if (target === 'commands') {
                message.channel.send(`<:embed:869120964158451762> Feeding new slash commands to Discord overlords... <:wait:1043139154298544238>`);
                await reloadCommands(client);
                return message.reply('<:GreenTick:864757985917665300> Slash commands reloaded and sharper than ever!');
            } else if (target === 'text-commands') {
                message.channel.send(`<:embed:869120964158451762> Updating text command vocabulary... <:wait:1043139154298544238>`);
                await reloadTextCommands(client);
                return message.reply('<:GreenTick:864757985917665300> Text commands refreshed and witty as heck!');
            } else if (target === 'events') {
                message.channel.send(`<:embed:869120964158451762> Rewiring neural pathways for events... <:wait:1043139154298544238>`);
                await reloadEvents(client);
                return message.reply('<:GreenTick:864757985917665300> Event handlers reloaded! I can feel everything again!');
            } else if (target === 'pull') {
                // Pull from git and reload everything
                message.channel.send(`<:embed:869120964158451762> Pulling latest changes from the mothership... <:wait:1043139154298544238>`);
                await gitPullAndReload(client, message);
                return; // Response handled in gitPullAndReload
            } else {
                return message.reply('Usage: `,reload [all|commands|text-commands|events|pull]`\nChoose your power wisely, master.');
            }
        }
    });

    console.log('Hot reload system initialized');
}

async function reloadCommands(client) {
    // Clear command collection
    client.commands.clear();

    // Clear require cache for command files
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        delete require.cache[require.resolve(filePath)];
    }

    // Reload commands
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            const command = require(filePath);
            if (command.data && command.data.name) {
                client.commands.set(command.data.name, command);
                console.log(`Reloaded slash command: ${command.data.name}`);
            }
        } catch (error) {
            console.error(`Error reloading command ${file}:`, error);
        }
    }
}

async function reloadTextCommands(client) {
    // Save the reload command to add back later
    const reloadCommand = client.textCommands.get('reload');

    // Clear command collection
    client.textCommands.clear();

    // Clear require cache for command files
    const commandsPath = path.join(__dirname, 'text-commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        delete require.cache[require.resolve(filePath)];
    }

    // Reload commands
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            const command = require(filePath);
            if (command.name) {
                client.textCommands.set(command.name, command);
                console.log(`Reloaded text command: ${command.name}`);
            }
        } catch (error) {
            console.error(`Error reloading text command ${file}:`, error);
        }
    }

    // Add back the reload command
    if (reloadCommand) {
        client.textCommands.set('reload', reloadCommand);
    }
}

async function reloadEvents(client) {
    // Remove all listeners
    const events = client._events;
    for (const event in events) {
        if (event !== 'newListener' && event !== 'removeListener') {
            client.removeAllListeners(event);
        }
    }

    // Clear require cache for event files
    const eventsPath = path.join(__dirname, 'events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        delete require.cache[require.resolve(filePath)];
    }

    // Reload events
    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        try {
            const event = require(filePath);
            if (event.once) {
                client.once(event.name, (...args) => event.execute(client, ...args));
            } else {
                client.on(event.name, (...args) => event.execute(client, ...args));
            }
            console.log(`Reloaded event: ${event.name}`);
        } catch (error) {
            console.error(`Error reloading event ${file}:`, error);
        }
    }

    // Ensure the ready event handler is set up again
    if (!client._events.ready) {
        client.once('ready', () => {
            console.log(`Re-attached ready event handler: ${client.user.tag}!`);
        });
    }
}

async function reloadAll(client) {
    await reloadCommands(client);
    await reloadTextCommands(client);
    await reloadEvents(client);
}

async function gitPullAndReload(client, message) {
    exec('git pull', { cwd: __dirname }, async (error, stdout, stderr) => {
        if (error) {
            console.error(`Git pull error: ${error.message}`);
            return message.reply(`Error pulling from GitHub:\n\`\`\`${error.message}\`\`\``);
        }

        if (stderr && !stderr.includes('Already up to date')) {
            console.error(`Git pull stderr: ${stderr}`);
        }

        const output = stdout.trim();

        if (output.includes('Already up to date')) {
            return message.reply('<:GreenTick:864757985917665300> Already up to date. Nothing to change in this timeline.');
        }

        // Reload everything
        try {
            await reloadAll(client);
            message.reply(`<:GreenTick:864757985917665300> Successfully pulled changes and injected new code:\n\`\`\`${output}\`\`\``);
        } catch (reloadError) {
            console.error('Error during reload:', reloadError);
            message.reply(`Warning! Encountered anomalies during reload:\n\`\`\`${reloadError.message}\`\`\``);
        }
    });
}

module.exports = { setupHotReload };