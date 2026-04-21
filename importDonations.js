// importDonations.js
const fs = require('fs');
const path = require('path');

// Load your existing bot data file
const botDataPath = path.join(__dirname, 'data', 'donations.json');
const botData = JSON.parse(fs.readFileSync(botDataPath, 'utf8'));

// Load the export (put this file anywhere, e.g. root of your project)
const records = require('./donations_export.json'); // rename your exported file to this

const now = new Date().toISOString();

for (const record of records) {
  const { userId, donations } = record;

  if (!userId || donations === undefined || donations === null) continue;
  if (donations === 0) continue; // skip zero entries (optional)

  if (!botData[userId]) {
    botData[userId] = {
      note: null,
      noteSetBy: null,
      noteSetAt: null,
      totalDonated: 0,
      donations: []
    };
  }

  botData[userId].donations.push({
    amount: donations,
    timestamp: record._id?.createdAt ?? now,
    addedBy: 'import',
    manual: true
  });

  botData[userId].totalDonated += donations;
}

fs.writeFileSync(botDataPath, JSON.stringify(botData, null, 2));
console.log('Import complete!');
