const fs = require('fs');

// Read JSON files
const poolData = require('./pool.json');
const itemsData = require('./items.json');

// Ensure item prices are case insensitive
const itemPrices = {};
for (const [item, price] of Object.entries(itemsData)) {
  itemPrices[item.toLowerCase()] = price;
}

// Calculate total worth for each item
const totals = Object.keys(poolData).map(item => {
  const price = itemPrices[item.toLowerCase()];
  if (price !== undefined) {
    const quantity = poolData[item];
    const totalWorth = quantity * price;
    return { item, quantity, totalWorth };
  }
  return null;
}).filter(result => result !== null);

// Sort items by total worth in descending order
totals.sort((a, b) => b.totalWorth - a.totalWorth);

// Create output text
let output = 'Item\tQuantity\tTotal Worth\n';
output += '------------------------------\n';
let grandTotal = 0;

totals.forEach(({ item, quantity, totalWorth }) => {
  output += `${item}\t${quantity}\t${totalWorth.toLocaleString()}\n`;
  grandTotal += totalWorth;
});

// Add grand total at the end
output += '------------------------------\n';
output += `Total of all items:\t\t${grandTotal.toLocaleString()}\n`;

// Save to text file
fs.writeFileSync('items_total_worth.txt', output);

console.log('Output saved to items_total_worth.txt');
