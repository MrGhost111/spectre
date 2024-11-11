const fs = require('fs');
const path = require('path');

function initializeHighlights() {
    // Define the data directory path
    const dataDir = path.join(__dirname, '../data');
    const highlightsPath = path.join(dataDir, 'highlights.json');

    // Create data directory if it doesn't exist
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log('Created data directory');
    }

    // Create highlights.json if it doesn't exist
    if (!fs.existsSync(highlightsPath)) {
        fs.writeFileSync(highlightsPath, JSON.stringify({}, null, 2), 'utf8');
        console.log('Initialized highlights.json');
    } else {
        console.log('highlights.json already exists');
    }
}

// Run the initialization
initializeHighlights();
