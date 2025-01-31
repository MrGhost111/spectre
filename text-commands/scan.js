const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

module.exports = {
    name: 'purify',
    description: 'Check all server members for inappropriate content in their profiles',
    async execute(message, args) {
        // Check if user has admin permissions
        if (!message.member.permissions.has('ADMINISTRATOR')) {
            return message.reply('This command can only be used by administrators.');
        }

        // Create status message
        const statusMsg = await message.channel.send('🔍 Scanning all server members... This might take a while.');

        // Get all members
        const members = await message.guild.members.fetch();
        const inappropriateUsers = new Map();
        
        // API endpoint for content moderation (you'll need to replace this with your preferred API)
        const MODERATION_API = 'YOUR_CONTENT_MODERATION_API_ENDPOINT';
        
        // Function to check text for inappropriate content
        async function checkContent(text) {
            if (!text) return false;
            
            // Basic word filter (expand this list as needed)
            const bannedWords = [
                'retard', // Replace with actual word
                'nigga',
                'faggot','nigger','negro','faggots','retarded' // Replace with actual word
                // Add more banned words
            ];
            
            // Convert to lowercase for case-insensitive checking
            const lowercaseText = text.toLowerCase();
            
            // Check against banned words
            for (const word of bannedWords) {
                if (lowercaseText.includes(word)) {
                    return true;
                }
            }

            // Optional: Make API call to content moderation service
            try {
                const response = await fetch(MODERATION_API, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ text }),
                });
                const data = await response.json();
                return data.inappropriate;
            } catch (error) {
                console.error('Error checking content:', error);
                return false;
            }
        }

        // Check each member
        for (const [id, member] of members) {
            const issues = [];
            
            // Check username
            if (await checkContent(member.user.username)) {
                issues.push('username');
            }
            
            // Check nickname
            if (member.nickname && await checkContent(member.nickname)) {
                issues.push('nickname');
            }
            
            // Check custom status if available
            const activity = member.presence?.activities?.find(a => a.type === 'CUSTOM');
            if (activity?.state && await checkContent(activity.state)) {
                issues.push('status');
            }
            
            // Check user bio/about me if available
            if (member.user.bio && await checkContent(member.user.bio)) {
                issues.push('bio');
            }
            
            if (issues.length > 0) {
                inappropriateUsers.set(member.id, {
                    member,
                    issues
                });
            }
        }

        // If no inappropriate content found
        if (inappropriateUsers.size === 0) {
            await statusMsg.edit('✅ No inappropriate content found in member profiles!');
            return;
        }

        // Create summary message
        let summaryText = `Found ${inappropriateUsers.size} members with inappropriate content:\n\n`;
        for (const [id, data] of inappropriateUsers) {
            summaryText += `- ${data.member.user.tag}: ${data.issues.join(', ')}\n`;
        }
        summaryText += '\nWould you like to notify these members and kick them? (Reply with "yes" to confirm)';

        await statusMsg.edit(summaryText);

        // Wait for confirmation
        try {
            const filter = m => m.author.id === message.author.id && m.content.toLowerCase() === 'yes';
            const collected = await message.channel.awaitMessages({
                filter,
                max: 1,
                time: 30000,
                errors: ['time']
            });

            if (collected.first().content.toLowerCase() === 'yes') {
                // Create server invite for DMs
                const invite = await message.channel.createInvite({
                    maxAge: 86400, // 24 hours
                    maxUses: inappropriateUsers.size
                });

                // Process each user
                for (const [id, data] of inappropriateUsers) {
                    try {
                        // Send DM
                        await data.member.send(
                            `You have been removed from ${message.guild.name} due to inappropriate content ` +
                            `in your ${data.issues.join(', ')}. Please remove the inappropriate content ` +
                            `and rejoin using this invite link: ${invite.url}`
                        );
                        
                        // Kick member
                        await data.member.kick('Inappropriate profile content');
                    } catch (error) {
                        console.error(`Failed to process member ${data.member.user.tag}:`, error);
                    }
                }

                await message.channel.send('✅ Completed processing all flagged members.');
            }
        } catch (error) {
            await message.channel.send('Operation cancelled or timed out.');
        }
    }
};
