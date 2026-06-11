/**
 * Shared API client for game APIs
 * Centralizes sign building, HTTP requests, and player data fetching
 * Used by: fetchPlayerData.js, refreshAlliance.js, redeemFunction.js
 */

const crypto = require('crypto');
const axios = require('axios');
const http = require('http');
const https = require('https');
const { getGameProxyAgent } = require('./proxySupport');
const { getDefaultGameType } = require('./gameRuntime');
const { API_CONFIG, getApiConfig } = require('./apiConfig');

const isDevMode = process.env.WOSLAND_DEV_MODE === '1';

const httpAgent = new http.Agent({ keepAlive: false });
const httpsAgent = new https.Agent({ keepAlive: false });

const giftCodeHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 5, keepAliveMsecs: 30000 });
const giftCodeHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 5, keepAliveMsecs: 30000 });

function getDirectAgent(url, preferKeepAlive = false) {
    const isHttpsUrl = url.startsWith('https');
    if (preferKeepAlive) return isHttpsUrl ? giftCodeHttpsAgent : giftCodeHttpAgent;
    return isHttpsUrl ? httpsAgent : httpAgent;
}

function getAgentForGameRequest(url, preferKeepAlive = false) {
    return getGameProxyAgent(url) || getDirectAgent(url, preferKeepAlive);
}

const BROWSER_PROFILES = [
    {
        browser: 'Chrome',
        versions: [124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135],
        platforms: [
            { os: 'Windows NT 10.0; Win64; x64', secPlatform: '"Windows"' },
            { os: 'Windows NT 11.0; Win64; x64', secPlatform: '"Windows"' },
            { os: 'Macintosh; Intel Mac OS X 10_15_7', secPlatform: '"macOS"' },
            { os: 'X11; Linux x86_64', secPlatform: '"Linux"' }
        ],
        buildSecUa: (ver) => `"Not:A-Brand";v="99", "Google Chrome";v="${ver}", "Chromium";v="${ver}"`
    },
    {
        browser: 'Brave',
        versions: [132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145],
        platforms: [
            { os: 'Windows NT 10.0; Win64; x64', secPlatform: '"Windows"' },
            { os: 'Windows NT 11.0; Win64; x64', secPlatform: '"Windows"' },
            { os: 'Macintosh; Intel Mac OS X 10_15_7', secPlatform: '"macOS"' }
        ],
        buildSecUa: (ver) => `"Not:A-Brand";v="99", "Brave";v="${ver}", "Chromium";v="${ver}"`
    },
    {
        browser: 'Edge',
        versions: [124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135],
        platforms: [
            { os: 'Windows NT 10.0; Win64; x64', secPlatform: '"Windows"' },
            { os: 'Windows NT 11.0; Win64; x64', secPlatform: '"Windows"' },
            { os: 'Macintosh; Intel Mac OS X 10_15_7', secPlatform: '"macOS"' }
        ],
        buildSecUa: (ver) => `"Not A(B)rand";v="8", "Chromium";v="${ver}", "Microsoft Edge";v="${ver}"`
    }
];

function generateBrowserHeaders(origin = API_CONFIG.ORIGIN) {
    const profile = BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];
    const version = profile.versions[Math.floor(Math.random() * profile.versions.length)];
    const platform = profile.platforms[Math.floor(Math.random() * profile.platforms.length)];
    return {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.7',
        'Origin': origin,
        'Referer': `${origin}/`,
        'User-Agent': `Mozilla/5.0 (${platform.os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Safari/537.36`,
        'sec-ch-ua': profile.buildSecUa(version),
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': platform.secPlatform,
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'sec-gpc': '1',
    };
}

function resolveApiConfig(gameTypeOrConfig = null) {
    if (gameTypeOrConfig && typeof gameTypeOrConfig === 'object' && gameTypeOrConfig.PLAYER_URL) {
        return gameTypeOrConfig;
    }
    if (typeof gameTypeOrConfig === 'string') return getApiConfig(gameTypeOrConfig);
    return getApiConfig(getDefaultGameType());
}

function buildPlayerPayload(playerId, gameTypeOrConfig = null) {
    const apiConfig = resolveApiConfig(gameTypeOrConfig);
    const currentTime = Date.now();
    const form = `fid=${playerId}&time=${currentTime}`;
    const sign = crypto.createHash('md5').update(form + apiConfig.SECRET).digest('hex');
    return `sign=${sign}&${form}`;
}

function encodeData(data, gameTypeOrConfig = null) {
    const apiConfig = resolveApiConfig(gameTypeOrConfig);
    const sortedKeys = Object.keys(data).sort();
    const encodedData = sortedKeys
        .map(key => `${key}=${typeof data[key] === 'object' ? JSON.stringify(data[key]) : data[key]}`)
        .join('&');
    const sign = crypto.createHash('md5').update(encodedData + apiConfig.SECRET).digest('hex');
    return `sign=${sign}&${encodedData}`;
}

/**
 * POST using axios (replaces node-fetch)
 */
async function fetchPost(url, body, origin = API_CONFIG.ORIGIN) {
    const agent = getAgentForGameRequest(url);
    const response = await axios.post(url, body, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...generateBrowserHeaders(origin)
        },
        httpAgent: agent,
        httpsAgent: agent,
        timeout: 15000,
        validateStatus: null // don't throw on non-2xx
    });

    if (response.status === 429) throw new Error('RATE_LIMIT');
    if (response.status !== 200) throw new Error(`API returned status ${response.status}`);

    return { status: response.status, data: response.data };
}

/**
 * Native http/https POST (unchanged — already doesn't use node-fetch)
 */
async function nativePost(url, payload, label, cookies, gameTypeOrConfig = null) {
    const apiConfig = resolveApiConfig(gameTypeOrConfig);
    return new Promise((resolve, reject) => {
        const postData = encodeData(payload, apiConfig);
        const urlObject = new URL(url);
        const browserHeaders = generateBrowserHeaders(apiConfig.ORIGIN);
        const isHttps = urlObject.protocol === 'https:';
        const agent = getAgentForGameRequest(url, true);
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData),
            ...browserHeaders
        };
        if (cookies) headers['Cookie'] = cookies;

        const options = {
            hostname: urlObject.hostname,
            port: urlObject.port || (isHttps ? 443 : 80),
            path: urlObject.pathname,
            method: 'POST',
            agent,
            headers
        };

        const client = isHttps ? https : http;
        const req = client.request(options, (res) => {
            let raw = '';
            const setCookies = res.headers['set-cookie'] || [];
            const rateLimit = {
                limit: res.headers['x-ratelimit-limit'] ? parseInt(res.headers['x-ratelimit-limit'], 10) : undefined,
                remaining: res.headers['x-ratelimit-remaining'] ? parseInt(res.headers['x-ratelimit-remaining'], 10) : undefined
            };
            res.on('data', chunk => { raw += chunk; });
            res.on('end', () => {
                let data;
                try { data = JSON.parse(raw); } catch { data = raw; }
                resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data, raw, cookies: setCookies, rateLimit });
            });
        });

        req.setTimeout(15000, () => {
            req.destroy();
            const msg = `${label} request timed out after 15 seconds`;
            console.warn(`[timeout] ${msg} — ${url}`);
            reject(new Error(msg));
        });

        req.on('error', error => {
            if (isDevMode) console.error(`${label} request failed:`, error.message);
            reject(error);
        });

        req.write(postData);
        req.end();
    });
}

class PlayerApiManager {
    constructor(gameType = getDefaultGameType()) {
        this.gameType = gameType;
        this.apiConfig = getApiConfig(gameType);
        this.apis = [
            { url: this.apiConfig.PLAYER_URL, origin: this.apiConfig.ORIGIN },
            this.apiConfig.PLAYER_URL_2
                ? { url: this.apiConfig.PLAYER_URL_2, origin: this.apiConfig.ORIGIN_2 || this.apiConfig.ORIGIN }
                : null
        ].filter(Boolean);

        this.requestTimestamps = this.apis.map(() => []);
        this.rateLimitPerApi = 30;
        this.rateLimitWindow = 60000;
        this.lastApiUsed = 0;
        this.dualApiMode = false;
        this.availableApis = [0];
        this.requestDelay = 2000;
    }

    async checkAvailability(testFid = '46765089') {
        const results = await Promise.allSettled(
            this.apis.map(async (api) => {
                const body = buildPlayerPayload(testFid, this.apiConfig);
                const agent = getAgentForGameRequest(api.url);
                const response = await axios.post(api.url, body, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        ...generateBrowserHeaders(api.origin)
                    },
                    httpAgent: agent,
                    httpsAgent: agent,
                    timeout: 5000,
                    validateStatus: null
                });
                return response.status === 200 || response.status === 429;
            })
        );

        const available = results.map(r => r.status === 'fulfilled' && r.value === true);
        this.availableApis = available.map((ok, i) => ok ? i : -1).filter(i => i !== -1);

        if (this.availableApis.length >= 2) {
            this.dualApiMode = true;
            this.requestDelay = 1000;
            console.log(`[PlayerApiManager:${this.gameType}] Dual-API mode active (1 player/second)`);
        } else if (this.availableApis.length === 1) {
            this.dualApiMode = false;
            this.requestDelay = 2000;
            const unavailableIndex = this.availableApis[0] === 0 ? 1 : 0;
            if (this.apis.length >= 2) {
                console.log(`[PlayerApiManager:${this.gameType}] Single-API mode — API ${unavailableIndex + 1} unavailable`);
            } else {
                console.log(`[PlayerApiManager:${this.gameType}] Single-API mode active (1 player/2 seconds)`);
            }
        } else {
            this.availableApis = [0];
            this.dualApiMode = false;
            this.requestDelay = 2000;
            console.warn(`[PlayerApiManager:${this.gameType}] No player APIs reachable — defaulting to API 1`);
        }
    }

    getNextApi() {
        const now = Date.now();
        for (let i = 0; i < this.requestTimestamps.length; i++) {
            this.requestTimestamps[i] = this.requestTimestamps[i].filter(t => now - t < this.rateLimitWindow);
        }

        let selectedIndex;
        if (this.dualApiMode) {
            const candidates = this.availableApis.filter(i => this.requestTimestamps[i].length < this.rateLimitPerApi);
            if (candidates.length >= 2) {
                selectedIndex = candidates.find(i => i !== this.lastApiUsed) ?? candidates[0];
            } else if (candidates.length === 1) {
                selectedIndex = candidates[0];
            } else {
                selectedIndex = 0;
            }
        } else {
            const available = this.availableApis.find(i => this.requestTimestamps[i].length < this.rateLimitPerApi);
            selectedIndex = available ?? this.availableApis[0] ?? 0;
        }

        this.requestTimestamps[selectedIndex].push(now);
        this.lastApiUsed = selectedIndex;
        return this.apis[selectedIndex];
    }

    getRequestDelay() { return this.requestDelay; }

    getModeDescription() {
        if (this.dualApiMode) return 'Dual-API mode active (1 player/second)';
        if (this.apis.length < 2) return 'Single-API mode active (1 player/2 seconds)';
        const unavailable = this.availableApis[0] === 0 ? 2 : 1;
        return `Single-API mode (1 player/2 seconds) — API ${unavailable} unavailable`;
    }
}

const playerApiManagers = new Map();

function getPlayerApiManager(gameType = getDefaultGameType()) {
    if (!playerApiManagers.has(gameType)) {
        playerApiManagers.set(gameType, new PlayerApiManager(gameType));
    }
    return playerApiManagers.get(gameType);
}

const playerApiManager = getPlayerApiManager();

async function fetchPlayerData(playerId, options = {}) {
    const { onError, delay, returnErrorObject = false, gameType } = options;
    const apiConfig = resolveApiConfig(gameType);
    const apiManager = getPlayerApiManager(apiConfig.GAME_TYPE);
    const delayFn = delay || ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
    let retries = 0;

    while (retries < apiConfig.MAX_RETRIES) {
        try {
            const body = buildPlayerPayload(playerId, apiConfig);
            const { url: apiUrl, origin: apiOrigin } = apiManager.getNextApi();
            const { data } = await fetchPost(apiUrl, body, apiOrigin);

            if (data.err_code === 40001 || data.msg === 'ROLE NOT EXIST' || data.msg === 'ROLE NOT EXIST.') {
                if (returnErrorObject) return { error: 'ROLE NOT EXIST', playerNotExist: true };
                return null;
            }

            const errorMsg = (data.msg || '').toLowerCase();
            if (errorMsg.includes('not exist') || errorMsg.includes('invalid')) {
                if (returnErrorObject) return { error: data.msg || 'Unknown error', playerNotExist: true };
                return null;
            }

            if (data.code === 0 && data.data) return data.data;

            throw new Error(`API returned error: ${data.msg || 'Unknown error'}`);

        } catch (error) {
            if (error.message === 'RATE_LIMIT') throw error;
            retries++;
            if (onError) await onError(error, 'fetchPlayerFromAPI');
            if (retries < apiConfig.MAX_RETRIES) await delayFn(apiConfig.RETRY_DELAY);
        }
    }

    if (returnErrorObject) return { error: 'MAX_RETRIES_EXCEEDED', playerNotExist: false };
    return null;
}

module.exports = {
    buildPlayerPayload,
    encodeData,
    fetchPost,
    nativePost,
    fetchPlayerData,
    getPlayerApiManager,
    playerApiManager
};