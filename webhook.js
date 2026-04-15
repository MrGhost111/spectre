const http = require("http");
const crypto = require("crypto");
const { exec } = require("child_process");
require("dotenv").config();

const SECRET = process.env.WEBHOOK_SECRET;
const PORT = process.env.WEBHOOK_PORT || 9000;

http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/webhook") {
        res.writeHead(404).end();
        return;
    }

    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {

        // Verify signature
        const sig = "sha256=" + crypto
            .createHmac("sha256", SECRET)
            .update(body)
            .digest("hex");

        if (req.headers["x-hub-signature-256"] !== sig) {
            console.log("Unauthorized webhook attempt");
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

        // Only care about pushes to main
        if (payload.ref !== "refs/heads/main") {
            res.writeHead(200).end("Ignored");
            return;
        }

        // Respond immediately — GitHub will timeout if you wait for the script
        res.writeHead(200).end("OK");

        console.log(`[${new Date().toISOString()}] Push detected, running update script...`);
        exec("/home/opc/update-and-restart.sh", (err, stdout, stderr) => {
            if (err) console.error("Script failed:", stderr);
            else console.log("Script output:", stdout);
        });
    });

}).listen(PORT, () => {
    console.log(`Webhook listener running on port ${PORT}`);
});
