function fuzzySearch(input, items) {
    input = input.toLowerCase();

    let bestItem = '';
    let bestValue = 0.0;

    const it = new Map();
    for (const item of Object.keys(items)) {
        let value = 1 - (editDistance(item.toLowerCase(), input) / item.length);
        if (item.toLowerCase().replace(/\s+/g, '').includes(input)) {
            value = 0.996;
        }
        const words = item.split(' ');
        words.forEach(word => {
            if (input === word.toLowerCase()) {
                value = 0.997;
            }
        });
        it.set(item, value);
        if (value > bestValue) {
            bestValue = value;
            bestItem = item;
        }
    }
    return bestItem;

    function editDistance(s1, s2) {
        s1 = s1.toLowerCase();
        s2 = s2.toLowerCase();

        const costs = [];
        for (let i = 0; i <= s1.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= s2.length; j++) {
                if (i === 0) {
                    costs[j] = j;
                } else {
                    if (j > 0) {
                        let newValue = costs[j - 1];
                        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                        }
                        costs[j - 1] = lastValue;
                        lastValue = newValue;
                    }
                }
            }
            if (i > 0) {
                costs[s2.length] = lastValue;
            }
        }

        return costs[s2.length];
    }
}
