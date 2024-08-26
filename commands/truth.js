const fs = require('fs');
const path = './data/channels.json';

// Load the JSON data
const rawData = fs.readFileSync(path);
const channelsData = JSON.parse(rawData);

// Create dictionaries to keep track of users and channels
const userChannels = {};
const channelOwners = {};
const errors = {
  multipleChannels: [],
  sharedChannels: []
};

// Populate the dictionaries and check for issues
for (const userId in channelsData) {
  if (userId === "channels") continue; // Skip the channels array

  const channelId = channelsData[userId].channelId;

  // Check if the user already has a channel assigned
  if (userChannels[userId]) {
    errors.multipleChannels.push({ userId, channelIds: [userChannels[userId], channelId] });
  } else {
    userChannels[userId] = channelId;
  }

  // Check if the channel is already assigned to another user
  if (channelOwners[channelId]) {
    errors.sharedChannels.push({ channelId, userIds: [channelOwners[channelId], userId] });
  } else {
    channelOwners[channelId] = userId;
  }
}

// Output results
if (errors.multipleChannels.length > 0) {
  console.log('Users with multiple channels:', errors.multipleChannels);
} else {
  console.log('No users with multiple channels found.');
}

if (errors.sharedChannels.length > 0) {
  console.log('Channels assigned to multiple users:', errors.sharedChannels);
} else {
  console.log('No channels assigned to multiple users found.');
}
