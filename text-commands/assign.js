const { PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'faizlamept3',
    description: 'Assigns two roles to 2100 random members, each role to a different set of people, with specified conditions.',
    async execute(message, args) {
        // Define role IDs
        const role1Id = '807580322966667264';  // The first role
        const role2Id = '723458951852851292';  // The second role
        const membersToAssign = 2100;  // Number of members to assign roles to

        // Get the roles
        const role1 = message.guild.roles.cache.get(role1Id);
        const role2 = message.guild.roles.cache.get(role2Id);

        if (!role1 || !role2) {
            return message.reply('Could not find required roles.');
        }

        // Initial status message
        const statusMsg = await message.channel.send('Fetching all server members...');

        try {
            // Fetch all guild members first
            await message.guild.members.fetch({ force: true });

            // Get eligible members for role 1 (does not have role1 and does not have role2)
            const eligibleForRole1 = message.guild.members.cache.filter(member => 
                !member.roles.cache.has(role1Id) &&  // Doesn't have role1
                !member.roles.cache.has(role2Id)     // Doesn't have role2
            );

            // Get eligible members for role 2 (does not have role2 and does not have role1)
            const eligibleForRole2 = message.guild.members.cache.filter(member => 
                !member.roles.cache.has(role2Id) &&  // Doesn't have role2
                !member.roles.cache.has(role1Id)     // Doesn't have role1
            );

            await statusMsg.edit(`Found ${eligibleForRole1.size} eligible members for role1 and ${eligibleForRole2.size} eligible members for role2.`);

            if (eligibleForRole1.size === 0 || eligibleForRole2.size === 0) {
                return message.reply('No eligible members found for one or both roles.');
            }

            // Convert to arrays and shuffle/select random members
            const role1Members = Array.from(eligibleForRole1.values())
                .sort(() => Math.random() - 0.5)
                .slice(0, membersToAssign);
            const role2Members = Array.from(eligibleForRole2.values())
                .sort(() => Math.random() - 0.5)
                .slice(0, membersToAssign);

            // Create arrays for bulk update
            const role1Promises = role1Members.map(member => member.roles.add(role1));
            const role2Promises = role2Members.map(member => member.roles.add(role2));

            // Counter for progress updates
            let role1Count = 0;
            let role2Count = 0;

            // Assign roles in bulk (Promise.all for simultaneous processing)
            // Process role 1 assignments
            for (const promise of role1Promises) {
                await promise;  // Wait for each promise to resolve
                role1Count++;

                // Update progress every 50 assignments
                if (role1Count % 50 === 0) {
                    await statusMsg.edit(`Progress: ${role1Count} out of ${membersToAssign} for Role 1 assigned.`);
                }
            }

            // Process role 2 assignments
            for (const promise of role2Promises) {
                await promise;  // Wait for each promise to resolve
                role2Count++;

                // Update progress every 50 assignments
                if (role2Count % 50 === 0) {
                    await statusMsg.edit(`Progress: ${role2Count} out of ${membersToAssign} for Role 2 assigned.`);
                }
            }

            // Final status update
            await statusMsg.edit(`✅ Finished! Successfully assigned ${role1Count} members to Role 1 and ${role2Count} members to Role 2.`);

        } catch (error) {
            console.error('Error in faizlamept3 command:', error);
            await statusMsg.edit('An error occurred while assigning roles. Check console for details.');
        }
    },
};
