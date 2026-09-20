const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const { execFile } = require("child_process");
require("dotenv").config();

const SECRET = process.env.WEBHOOK_SECRET;
const PORT = process.env.WEBHOOK_PORT || 9000;
const SCRIPT = "/home/opc/update-and-restart.sh";
const PAUSE_FLAG = "/home/opc/.deploy-paused";

if (!SECRET) {
    console.error("WEBHOOK_SECRET is not set — refusing to start.");
    process.exit(1);
}

let running = false;
let pending = false;

function log(...args) {
    console.log(`[${new Date().toISOString()}]`, ...args);
}

function runDeploy() {
    if (running) {
        // A push arrived mid-deploy; remember to run once more afterwards
        // so the newest commit never gets skipped.
        pending = true;
        log("Deploy already running — queued a follow-up run.");
        return;
    }
    running = true;
    log("Running update script...");

    execFile("/bin/bash", [SCRIPT], { timeout: 10 * 60 * 1000 }, (err, stdout, stderr) => {
        running = false;
        if (err) log("Script failed:", err.message, stderr);
        else log("Script finished.");

        if (pending) {
            pending = false;
            log("Running queued deploy.");
            runDeploy();
        }
    });
}

function validSignature(body, header) {
    if (typeof header !== "string") return false;
    const expected = "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            ok: true,
            paused: fs.existsSync(PAUSE_FLAG),
            deploying: running
        }));
        return;
    }

    if (req.method !== "POST" || req.url !== "/webhook") {
        res.writeHead(404).end();
        return;
    }

    let body = "";
    let tooBig = false;

    req.on("data", chunk => {
        body += chunk;
        if (body.length > 5_000_000) {
            tooBig = true;
            res.writeHead(413).end("Too large");
            req.destroy();
        }
    });

    req.on("end", () => {
        if (tooBig) return;

        if (!validSignature(body, req.headers["x-hub-signature-256"])) {
            log("Unauthorized webhook attempt from", req.socket.remoteAddress);
            res.writeHead(401).end("Unauthorized");
            return;
        }

        let payload;
        try {
            payload = JSON.parse(body);
        } catch {
            res.writeHead(400).end("Bad JSON");
            return;
        }

        if (req.headers["x-github-event"] === "ping") {
            res.writeHead(200).end("pong");
            return;
        }

        if (payload.ref !== "refs/heads/main") {
            res.writeHead(200).end("Ignored (not main)");
            return;
        }

        if (payload.deleted) {
            res.writeHead(200).end("Ignored (branch deleted)");
            return;
        }

        // Respond immediately — GitHub times out after ~10s.
        res.writeHead(200).end("OK");

        if (fs.existsSync(PAUSE_FLAG)) {
            log("Push received but deploys are PAUSED — ignoring.");
            return;
        }

        const who = payload.pusher && payload.pusher.name;
        const head = payload.head_commit && payload.head_commit.message;
        log(`Push to main by ${who || "unknown"}: ${head ? head.split("\n")[0] : "(no commit message)"}`);

        runDeploy();
    });

}).listen(PORT, () => {
    log(`Webhook listener running on port ${PORT}`);
});
