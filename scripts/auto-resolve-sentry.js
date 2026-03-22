// scripts/auto-resolve-sentry.js
// This script runs on a GitHub Actions schedule to pull unresolved Sentry issues.
// It creates a GitHub Issue containing the stack trace, which is designed to trigger an AI coding agent (like Antigravity or Sweep) to automatically formulate a PR to resolve it.

const SENTRY_ORG = process.env.SENTRY_ORG; 
const SENTRY_PROJECT = process.env.SENTRY_PROJECT || 'javascript';     
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY; // e.g. 'abhishekdutta18/blogspro'

async function fetchUnresolvedIssues() {
  const url = `https://sentry.io/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/?query=is:unresolved`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${SENTRY_AUTH_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!res.ok) {
    throw new Error(`Sentry API Error: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

async function createGitHubIssue(sentryIssue) {
  const url = `https://api.github.com/repos/${REPO}/issues`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'User-Agent': 'Sentry-Automation-Node',
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json'
    },
    body: JSON.stringify({
      title: `[Sentry Auto-Fix] ${sentryIssue.title}`,
      body: `An unresolved issue was pulled automatically from Sentry.\n\n`
          + `**Error:** ${sentryIssue.title}\n`
          + `**Culprit:** ${sentryIssue.culprit || 'Unknown'}\n`
          + `**Sentry Link:** [View Full Trace in Sentry](${sentryIssue.permalink || 'N/A'})\n\n`
          + `---\n`
          + `### 🤖 Automated AI Resolution Request\n`
          + `*Agent Prompt: Please analyze the provided error details, investigate the source code in this repository that roughly matches the culprit above, propose a logic fix, and open a Pull Request to resolve this bug natively.*`,
      labels: ["bug", "sentry-alert", "auto-fix"]
    })
  });
  
  if (!res.ok) {
    throw new Error(`GitHub API Error: ${res.status} ${await res.text()}`);
  }
  return await res.json();
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
      // Invoke `PUT /api/0/issues/{issue.id}/` to mark the issue as handled!
    }
    
    console.log("Automation pass complete.");
  } catch (err) {
    console.error("Automation failed:", err);
    process.exit(1);
  }
}

main();
