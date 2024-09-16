const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// Paths to the files
const csvFilePath = path.join(__dirname, 'donations.csv');
const jsonFilePath = path.join(__dirname, 'data', 'users.json');

// Read and parse the CSV file
const donations = {};

fs.createReadStream(csvFilePath)
  .pipe(csv())
  .on('data', (row) => {
    if (row.eventId === '5pWzZP') {
      const userId = row.userId;
      const donationAmount = parseFloat(row.donations);

      if (!donations[userId]) {
        donations[userId] = 0;
      }

      donations[userId] += donationAmount;
    }
  })
  .on('end', () => {
    // Read the existing users.json file
    fs.readFile(jsonFilePath, (err, data) => {
      if (err) throw err;

      const users = JSON.parse(data);

      // Update the users.json with new donation data
      for (const [userId, totalDonation] of Object.entries(donations)) {
        if (users[userId]) {
          users[userId].total = (users[userId].total || 0) + totalDonation;
        } else {
          users[userId] = {
            total: totalDonation
          };
        }
      }

      // Write the updated data back to users.json
      fs.writeFile(jsonFilePath, JSON.stringify(users, null, 2), (err) => {
        if (err) throw err;
        console.log('users.json has been updated.');
      });
    });
  });
