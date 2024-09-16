const fs = require('fs');

// Read JSON files
const poolData = JSON.parse(fs.readFileSync('pool.json', 'utf8'));
const itemsData = JSON.parse(fs.readFileSync('items.json', 'utf8'));

// Function to get item price case-insensitively
const getPrice = (itemName) => {
  const lowerCaseItemName = itemName.toLowerCase();
  for (const [key, value] of Object.entries(itemsData)) {
    if (key.toLowerCase() === lowerCaseItemName) {
      return value;
    }
  }
  return null;
};

// Calculate total worth for each item
const totalWorth = [];
for (const [item, quantity] of Object.entries(poolData)) {
  const price = getPrice(item);
  if (price !== null) {
    const total = quantity * price;
    totalWorth.push({ item, quantity, totalWorth: total });
  } else {
    console.warn(`Price for item "${item}" not found in items.json.`);
  }
}

// Sort items by total worth in descending order
totalWorth.sort((a, b) => b.totalWorth - a.totalWorth);

// Convert to JSON string and handle pagination
const output = JSON.stringify(totalWorth, null, 2);
const maxChunkSize = 2000; // Maximum character limit for each chunk
let offset = 0;
let chunkIndex = 1;

while (offset < output.length) {
  const chunk = output.substring(offset, offset + maxChunkSize);
  fs.writeFileSync(`sorted_items_chunk_${chunkIndex}.json`, chunk);
  offset += maxChunkSize;
  chunkIndex++;
}

console.log(`Data has been split into ${chunkIndex - 1} chunks.`);
