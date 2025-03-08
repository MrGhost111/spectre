const fs = require('fs');
const path = require('path');
const cooldownsPath = path.join(__dirname, '../data/cooldowns.json');
const commandCooldowns = new Map(); // In-memory cooldown storage for the resetcd command

module.exports = {
    name: 'resetcd',
    description: 'Resets the stfu command cooldown for a specified user.',
    execute(message, args) {
        // The ID of the user who can bypass the cooldown for resetcd command
        const bypassUserId = '753491023208120321';
        // Role IDs that get reduced 12h cooldown
        const reducedCooldownRoleIds = ['768449168297033769', '946729964328337408'];

        // Check if the user is the one who can bypass the resetcd command cooldown
        if (message.author.id !== bypassUserId) {
            const currentTime = Math.floor(Date.now() / 1000);
            const userCommandCooldown = commandCooldowns.get(message.author.id);

            // Check if the user is still on cooldown for resetcd command
            if (userCommandCooldown && userCommandCooldown > currentTime) {
                return message.channel.send(`You can use it again at <t:${userCommandCooldown}:t> (<t:${userCommandCooldown}:R>).`);
            }
        }

        // Read the cooldowns.json file
        let cooldowns = { users: [] };
        try {
            const cooldownData = fs.readFileSync(cooldownsPath, 'utf8');
            cooldowns = JSON.parse(cooldownData);
        } catch (error) {
            console.error('Error reading cooldowns.json:', error);
            return message.channel.send('An error occurred while trying to read the cooldown data.');
        }

        const targetUserId = message.author.id; // Use the command invoker's ID by default
        const userCooldown = cooldowns.users.find(user => user.userId === targetUserId);

        // Check if the user has a cooldown to reset
        if (!userCooldown) {
            return message.channel.send('You do not have an active cooldown to reset.');
        }

        // Remove the user from the cooldowns list
        cooldowns.users = cooldowns.users.filter(user => user.userId !== targetUserId);

        // Write the updated cooldowns data back to cooldowns.json
        fs.writeFile(cooldownsPath, JSON.stringify(cooldowns, null, 4), (err) => {
            if (err) {
                console.error('Error writing cooldown data:', err);
                return message.channel.send('An error occurred while trying to reset the cooldown.');
            }

            // Check if user has bypass permission
            if (message.author.id !== bypassUserId) {
                // Check if user has any of the reduced cooldown roles
                const hasReducedCooldownRole = message.member.roles.cache.some(role =>
                    reducedCooldownRoleIds.includes(role.id)
                );

                // Set cooldown based on role
                let cooldownDuration;
                if (hasReducedCooldownRole) {
                    cooldownDuration = 12 * 60 * 60; // 12 hours in seconds
                } else {
                    cooldownDuration = 24 * 60 * 60; // 24 hours in seconds
                }

                const cooldownEnd = Math.floor(Date.now() / 1000) + cooldownDuration;
                commandCooldowns.set(message.author.id, cooldownEnd);
            }

            // React with the specified emoji upon successful cooldown reset
            message.react('<a:tickloop:926319357288648784>').catch(console.error);
        });
    }
};