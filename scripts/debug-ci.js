/**
 * scripts/debug-ci.js
 * Debugging script for GitHub Actions environment.
 */
console.log("🛠️ CI Debugging Start");
console.log("- Node Version:", process.version);
console.log("- Current Directory:", process.cwd());

const modules = ["fs", "path", "fast-xml-parser", "rss-parser", "@google/genai", "node-fetch"];

modules.forEach(m => {
    try {
        require(m);
        console.log(`✅ Module '${m}' found.`);
    } catch (e) {
        console.error(`❌ Module '${m}' NOT FOUND:`, e.message);
    }
});

console.log("🛠️ CI Debugging End");
