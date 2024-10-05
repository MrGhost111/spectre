const fs = require('fs');
const path = require('path');

const mutesPath = path.join(__dirname, '../data/mutes.json');
const cooldowns = new Map(); // In-memory cooldown storage for the resetcd command

module.exports = {
///////////////////////////////////////////////////
/////////////////////////////////////////////////
/////////////////////////////////////////////////
///////////////////////////////////////////////
///////////////////////////////////////////////
//////////////////////////////////////////////////
// change export thing name later 
////////////////////////////////////////////////////
///////////////////////////////////////////////////

    name: 'resetcds',
    description: 'Resets the stfu command cooldown for a specified user.',
    execute(message, args) {
        // The ID of the user who can bypass the cooldown for resetcd command
        const bypassUserId = '753491023208120321';

        // Check if the user is the one who can bypass the resetcd command cooldown
        if (message.author.id !== bypassUserId) {
            const currentTime = Math.floor(Date.now() / 1000);
            const userCooldown = cooldowns.get(message.author.id);

            // Check if the user is still on cooldown for resetcd command
            if (userCooldown && userCooldown > currentTime) {
                return message.channel.send(`You can use it again at <t:${userCooldown}:t> (<t:${userCooldown}:R>).`);
            }
        }

        // Read the mutes.json file
        let mutes = { users: [] };
        try {
            const mutesData = fs.readFileSync(mutesPath, 'utf8');
            mutes = JSON.parse(mutesData);
        } catch (error) {
            console.error('Error reading mutes.json:', error);
            return message.channel.send('An error occurred while trying to read the mutes data.');
        }

        const targetUserId = message.author.id; // Use the command invoker's ID by default
        const userMute = mutes.users.find(mute => mute.userId === targetUserId);

        // Check if the user has a cooldown to reset
        if (!userMute) {
            return message.channel.send('You do not have an active cooldown to reset.');
        }

        // Remove the user from the mutes list
        mutes.users = mutes.users.filter(mute => mute.userId !== targetUserId);

        // Write the updated mutes data back to mutes.json
        fs.writeFile(mutesPath, JSON.stringify(mutes, null, 4), (err) => {
            if (err) {
                console.error('Error writing mutes data:', err);
                return message.channel.send('An error occurred while trying to reset the cooldown.');
            }

            // Set a 24-hour cooldown for the command, unless the user bypasses it
            if (message.author.id !== bypassUserId) {
                const cooldownEnd = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24 hours in seconds
                cooldowns.set(message.author.id, cooldownEnd);
            }

            // React with the specified emoji upon successful cooldown reset
            message.react('<a:tickloop:926319357288648784>').catch(console.error);
        });
    }
};
