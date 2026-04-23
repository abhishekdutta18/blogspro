import 'dotenv/config';
import 'dotenv/config';

const env = process.env;
const jobId = "test-job-" + Date.now();

// Mock the trace buffer
import fs from 'fs';
const traceFile = "./logs/institutional-trace.log";
if (!fs.existsSync("./logs")) fs.mkdirSync("./logs");
fs.writeFileSync(traceFile, "Test trace content");

// We need to access the private traceBuffer or just push to it
// Since it's a module level variable, we can't easily push to it from outside
// but we can try to call a function that uses it.
// Actually, I'll just copy the logic into this scratch script to test.

console.log("🔍 [Debug] Testing GitHub API POST to /issues...");
const res = await fetch("https://api.github.com/repos/abhishekdutta18/blogspro/issues", {
    method: "POST",
    headers: {
        "Authorization": `token ${env.GH_PAT}`,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "BlogsPro-Swarm-Agent"
    },
    body: JSON.stringify({
        title: "Debug Telemetry Trace",
        body: "```log\nTest trace\n```"
    })
});

console.log(`📡 [Result] Status: ${res.status}`);
if (!res.ok) {
    console.log(`❌ Error: ${await res.text()}`);
} else {
    console.log(`✅ Success: ${ (await res.json()).html_url }`);
}
