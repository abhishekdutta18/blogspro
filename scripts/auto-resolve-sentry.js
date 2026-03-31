// scripts/auto-resolve-sentry.js
import fetch from 'node-fetch';
// This script runs on a GitHub Actions schedule to pull unresolved Sentry issues.
// It creates a GitHub Issue containing the stack trace, which is designed to trigger an AI coding agent (like Antigravity or Sweep) to automatically formulate a PR to resolve it.

const SENTRY_ORG = process.env.SENTRY_ORG; 
const SENTRY_PROJECT = process.env.SENTRY_PROJECT || 'javascript';     
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const GITHUB_TOKEN = process.env.GH_PAT || process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY || 'abhishekdutta18/blogspro';

let CURRENT_SENTRY_ORG = SENTRY_ORG;
let CURRENT_SENTRY_PROJECT = SENTRY_PROJECT;

async function discoverSentryEnvironment() {
  const url = `https://de.sentry.io/api/0/projects/`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${SENTRY_AUTH_TOKEN}` }
  });
  
  if (!res.ok) {
    throw new Error(`Sentry Discovery Error: ${res.status} ${await res.text()}`);
  }
  
  const projects = await res.json();
  if (projects.length === 0) throw new Error("No Sentry projects found for this token.");
  
  // Use the first project found as the primary
  const target = projects[0];
  CURRENT_SENTRY_ORG = target.organization.slug;
  CURRENT_SENTRY_PROJECT = target.slug;
  
  console.log(`ð¡ Discovered Sentry Environment: Org=${CURRENT_SENTRY_ORG}, Project=${CURRENT_SENTRY_PROJECT}`);
}

async function fetchUnresolvedIssues() {
  const url = `https://de.sentry.io/api/0/projects/${CURRENT_SENTRY_ORG}/${CURRENT_SENTRY_PROJECT}/issues/?query=${encodeURIComponent('is:unresolved')}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${SENTRY_AUTH_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`Sentry API Error at ${url}`);
    throw new Error(`Sentry API Error: ${res.status} ${errorBody}`);
  }
  return await res.json();
}

async function checkExistingIssue(issueTitle) {
  const url = `https://api.github.com/repos/${REPO}/issues?state=all&per_page=100`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'User-Agent': 'Sentry-Automation-Node',
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  
  if (!res.ok) return false;
  const issues = await res.json();
  const targetTitle = `[Sentry Auto-Fix] ${issueTitle}`;
  return issues.some(i => i.title === targetTitle);
}

async function resolveSentryIssue(issueId) {
  const url = `https://de.sentry.io/api/0/issues/${issueId}/`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${SENTRY_AUTH_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'resolved' })
  });
  
  if (!res.ok) {
    console.error(`Failed to resolve Sentry issue ${issueId}: ${await res.text()}`);
    return false;
  }
  return true;
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
          + `### ð¤ Automated AI Resolution Request\n`
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
  if (!SENTRY_AUTH_TOKEN || !GITHUB_TOKEN || !REPO) {
    console.error("CRITICAL: Missing required environment variables (SENTRY_AUTH_TOKEN, GITHUB_TOKEN, GITHUB_REPOSITORY)");
    process.exit(1);
  }

  console.log("Initializing Sentry context...");
  try {
    await discoverSentryEnvironment();
    console.log("Connecting to Sentry to pull unresolved issues...");
    const issues = await fetchUnresolvedIssues();
    console.log(`Found ${issues.length} unresolved issues in Sentry.`);

    // Cap at the top 3 issues to avoid massively spamming the Github repo in one execution
    const issuesToProcess = issues.slice(0, 3);
    
    for (const issue of issuesToProcess) {
      console.log(`Processing Sentry Alert: ${issue.title}`);
      
      const exists = await checkExistingIssue(issue.title);
      if (exists) {
        console.log(`â³ Skipped: GitHub Issue already exists for "${issue.title}". Pending code resolution.`);
        console.log(`â³ Auto-closing stale Sentry ticket: ${issue.id}`);
        await resolveSentryIssue(issue.id);
        continue;
      }
      
      const ghIssue = await createGitHubIssue(issue);
      console.log(`â³ Successfully created tracking Issue: ${ghIssue.html_url}`);
      
      console.log(`â³ Marking Sentry ticket as resolved...`);
      await resolveSentryIssue(issue.id);
    }
    
    console.log("Automation pass complete.");
  } catch (err) {
    console.error("Automation failed:", err);
    process.exit(1);
  }
}

main();
