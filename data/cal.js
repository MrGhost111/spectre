const fs = require('fs');

// Load data from pool.json and items.json
const poolPath = 'pool.json';
const itemsPath = 'items.json';

let poolData = JSON.parse(fs.readFileSync(poolPath));
let itemsData = JSON.parse(fs.readFileSync(itemsPath));

// Function to calculate total worth of each item and update poolData
function calculateWorth() {
    // Ensure poolData is an object
    if (typeof poolData !== 'object' || poolData === null) {
        console.error("pool.json should be an object with item names as keys and quantities as values.");
        return;
    }

    // Update poolData with total worth for each item
    for (const [itemName, quantity] of Object.entries(poolData)) {
        // Check if item exists in itemsData
        if (itemsData[itemName]) {
            // Calculate total worth
            poolData[itemName] = {
                quantity: quantity,
                totalWorth: quantity * itemsData[itemName]
            };
        } else {
            console.error(`Item ${itemName} not found in items.json.`);
            poolData[itemName] = {
                quantity: quantity,
                totalWorth: null // Or some default value if needed
            };
        }
    }

    // Save updated poolData back to pool.json
    fs.writeFileSync(poolPath, JSON.stringify(poolData, null, 2));
    console.log("pool.json has been updated with total worth information.");
}

// Run the calculation
calculateWorth();
