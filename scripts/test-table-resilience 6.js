import { parseMD } from './lib/templates.js';
import { repairTables } from './lib/rules-engine.js';

const MALFORMED_TABLES = [
  {
    name: "Missing Leading/Trailing Pipes",
    content: `
Metric | 2025 | 2026 Shift
-------|------|-----------
Alpha  | 12.5 | +2.4%
Beta   | 8.9  | -0.5%
`
  },
  {
    name: "Uneven Columns",
    content: `
| Metric | 2025 | 2026 |
|--------|------|------|
| Alpha  | 12.5 |
| Beta   | 8.9  | +1.2 | Extra |
`
  },
  {
    name: "Broken Separator (missing dash)",
    content: `
| Metric | Value |
| -- | - |
| Data | 100 |
`
  },
  {
    name: "Mixed HTML and Markdown",
    content: `
<p>Analytical Context</p>
| Metric | 2026 |
|---|---|
| Growth | 15% |
`
  }
];

console.log("📊 [Resilience Test] Benchmarking Table Parsing...\n");

MALFORMED_TABLES.forEach(test => {
  console.log(`🔹 Testing: ${test.name}`);
  
  // 1. Try direct parsing
  const direct = parseMD(test.content);
  const hasTableDirect = direct.includes('<table');
  
  // 2. Try repair followed by parsing
  const repaired = repairTables(test.content);
  const fromRepaired = parseMD(repaired);
  const hasTableRepaired = fromRepaired.includes('<table');
  
  console.log(`   Direct:   ${hasTableDirect ? '✅ FOUND' : '❌ FAILED'}`);
  console.log(`   Repaired: ${hasTableRepaired ? '✅ FOUND' : '❌ FAILED'}`);
  
  if (test.name === "Missing Leading/Trailing Pipes") {
    console.log("   --- HTML Output (Repaired) ---");
    console.log(fromRepaired);
    console.log("   ------------------------------");
  }
  
  if (!hasTableDirect && !hasTableRepaired) {
    console.log("   ⚠️ CRITICAL: Table lost in both attempts.");
  }
  console.log("-".repeat(40));
});
