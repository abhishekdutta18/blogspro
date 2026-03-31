/**
 * black-swan-alert.js
 * =====================
 * BlogsPro Institutional Alert System.
 * Automatically opens GitHub Issues for critical market anomalies
 * detected by the MiroFish Consensus Swarm.
 */

export async function detectAndAlert(swarmResult, frequency) {
  const { wordCount, raw, jobId } = swarmResult;
  
  // 1. Analyze for "Black Swan" linguistic markers or volatility deltas
  // (In a real scenario, this would parse the consensus JSON for specific metrics)
  const isBlackSwan = raw.includes("BLACK_SWAN") || raw.includes("SYSTEMIC_CRASH") || raw.includes("VOLATILITY_DELTA > 30%");
  
  if (!isBlackSwan) return false;

  console.log("🚨 [Alert] BLACK SWAN DETECTED. Raising Institutional Multi-Asset Shift Issue...");

  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY; // e.g. "user/repo"

  if (!token || !repo) {
    console.warn("⚠️ [Alert] GitHub Token or Repository not found. Skipping issue creation.");
    return false;
  }

  const issueTitle = `🚨 CRITICAL: Institutional Black Swan Detected (${frequency.toUpperCase()})`;
  const issueBody = `
## 🕵️ MiroFish Consensus Alert
**Job ID:** \`${jobId}\`
**Frequency:** \`${frequency}\`
**Word Density:** ${wordCount} words

### 📋 Consensus Summary
The Swarm has detected a significant structural divergence in market institutional drift.

> [!CAUTION]
> **Systemic Risk Identified**: The consensus desk has flagged a "Black Swan" event requiring immediate manual review of the strategic manuscript.

### 📝 Strategic Context
${raw.substring(0, 1000)}...

[View Full Manuscript in R2 Assets](https://assets.blogspro.in/articles/${frequency}/${jobId}.html)
  `;

  try {
    const url = `https://api.github.com/repos/${repo}/issues`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody,
        labels: ['HIGH_PRIORITY_SIGNAL', 'INSTITUTIONAL_ALERt', 'BLACK_SWAN']
      })
    });

    if (res.ok) {
      const issue = await res.json();
      console.log(`✅ [Alert] GitHub Issue Created: ${issue.html_url}`);
      return true;
    } else {
      const err = await res.text();
      console.error(`❌ [Alert] Failed to create issue: ${err}`);
      return false;
    }
  } catch (e) {
    console.error(`❌ [Alert] Error in GitHub API call:`, e.message);
    return false;
  }
}
