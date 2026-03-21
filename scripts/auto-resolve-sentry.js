// scripts/auto-resolve-sentry.js
// This script runs on a GitHub Actions schedule to pull unresolved Sentry issues.
// It creates a GitHub Issue containing the stack trace, which is designed to trigger an AI coding agent (like Antigravity or Sweep) to automatically formulate a PR to resolve it.

const https = require('https');

// NOTE: Ensure your organization slug and project slug match your Sentry dashboard URLs
const SENTRY_ORG = process.env.SENTRY_ORG; 
const SENTRY_PROJECT = process.env.SENTRY_PROJECT || 'javascript';     
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY; // e.g. 'abhishekdutta18/blogspro'

async function fetchUnresolvedIssues() {
  return new Promise((resolve, reject) => {
    const url = `https://sentry.io/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/?query=is:unresolved`;
    const options = {
      headers: {
        'Authorization': `Bearer ${SENTRY_AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          console.error(`Sentry API Error Data: ${data}`);
          reject(new Error(`Sentry API Error: ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

async function createGitHubIssue(sentryIssue) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      title: `[Sentry Auto-Fix] ${sentryIssue.title}`,
      body: `An unresolved issue was pulled automatically from Sentry.\n\n`
          + `**Error:** ${sentryIssue.title}\n`
          + `**Culprit:** ${sentryIssue.culprit || 'Unknown'}\n`
          + `**Sentry Link:** [View Full Trace in Sentry](${sentryIssue.permalink})\n\n`
          + `---\n`
          + `### 🤖 Automated AI Resolution Request\n`
          + `*Agent Prompt: Please analyze the provided error details, investigate the source code in this repository that roughly matches the culprit above, propose a logic fix, and open a Pull Request to resolve this bug natively.*`,
      labels: ["bug", "sentry-alert", "auto-fix"]
    });

    const options = {
      hostname: 'api.github.com',
      path: `/repos/${REPO}/issues`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'Sentry-Automation-Node',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        if (res.statusCode === 201) resolve(JSON.parse(responseBody));
        else reject(new Error(`GitHub API Error: ${res.statusCode} ${responseBody}`));
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  if (!SENTRY_AUTH_TOKEN || !GITHUB_TOKEN || !REPO || !SENTRY_ORG) {
    console.error("CRITICAL: Missing required environment variables (SENTRY_AUTH_TOKEN, GITHUB_TOKEN, GITHUB_REPOSITORY, SENTRY_ORG)");
    process.exit(1);
  }

  console.log("Connecting to Sentry to pull unresolved issues...");
  try {
    const issues = await fetchUnresolvedIssues();
    console.log(`Found ${issues.length} unresolved issues in Sentry.`);

    // Cap at the top 3 issues to avoid massively spamming the Github repo in one execution
    const issuesToProcess = issues.slice(0, 3);
    
    for (const issue of issuesToProcess) {
      console.log(`Creating GitHub Issue for: ${issue.title}`);
      const ghIssue = await createGitHubIssue(issue);
      console.log(`Successfully created GitHub Issue: ${ghIssue.html_url}`);
      
      // Future Enhancement Phase 2:
      // Invoke `PUT /api/0/issues/{issue.id}/` to mark the issue internally in Sentry with a comment pointing to the GitHub issue.
    }
    
    console.log("Automation pass complete.");
  } catch (err) {
    console.error("Automation failed:", err);
    process.exit(1);
  }
}

main();
