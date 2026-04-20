import { sanitizePayload } from '../scripts/lib/rules-engine.js';

const mockContent = `
<h2>Section 1: Grounded Analysis</h2>
<p>This paragraph is grounded in RBI 2024 data.</p>

<section>
  <h3>Section 2: Hallucination Test</h3>
  <audit-purge reason="no_source">
    <p>This paragraph is hallucinated and should be purged.</p>
    <div class="terminal-chart" id="chart_fake"></div>
    <chart-data>{"labels": ["A"], "datasets": [{"name": "Fake", "values": [100]}], "source": "Imagination"}</chart-data>
  </audit-purge>
  <p>This paragraph follows the purge and should remain.</p>
</section>

<footer>End of Report</footer>
`;

const result = sanitizePayload(mockContent, { verticalId: 'test-audit' });

console.log("--- ORIGINAL CONTENT ---");
console.log(mockContent);
console.log("\n--- SANITIZED CONTENT ---");
console.log(result);

if (!result.includes("This paragraph is hallucinated") && result.includes("Grounded Analysis") && result.includes("End of Report")) {
  console.log("\n✅ SUCCESS: Surgical purge verified.");
} else {
  console.log("\n❌ FAILURE: Surgical purge failed.");
  process.exit(1);
}
