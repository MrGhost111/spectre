const fs = require('fs');

// Read the pool.json file
fs.readFile('pool.json', 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading the file:', err);
    return;
  }

  const items = JSON.parse(data);

  // Convert the items object to an array of [name, { quantity, totalWorth }]
  const itemArray = Object.entries(items);

  // Sort the items based on totalWorth in descending order
  itemArray.sort((a, b) => b[1].totalWorth - a[1].totalWorth);

  // Display the sorted items
  itemArray.forEach(([name, { quantity, totalWorth }]) => {
    console.log(`${name} (${quantity}) ${totalWorth}`);
  });
});
