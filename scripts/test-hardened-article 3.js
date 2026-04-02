import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBaseTemplate, parseMD } from './lib/templates.js';
import { sanitizePayload, repairTables, hardenJson, injectVisuals, enforceInstitutionalSections } from './lib/rules-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MOCK_MANUSCRIPT = `
ABSTRACT: This institutional manuscript verifies the structural integrity of the BlogsPro Intelligence Terminal Swarm 4.2. It focuses on the seamless integration of visual charts and data tables under malformed input conditions.

## 1. MACRO STRATEGIC DRIFT

The global macro landscape is shifting toward a high-volatility regime. Quantitative metrics suggest a 15% increase in cross-asset correlation.

Metric | 2025 | 2026 Shift
---|---|---
Alpha Yield | 12.5% | +2.4%
Beta Exposure | 8.9% | -0.5%
Gamma Desk | ▼ MultiPipe | | | 100 |
Delta Desk | NaN | | | High |
Epsilon Desk | PipeFail | | | Low |

<chart-data>{ "type": "bar", "title": "ASSET FLOW SYNTHESIS", "data": [["Asset", "Flow"], ["Equity", 1500], ["Debt", 1200]] }</chart-data>

## 2. INSTITUTIONAL LIQUIDITY

Liquidity patterns show significant divergence between EM and DM markets. 

| Market | Liquidity Index | Delta |
|--- | --- | ---|
| US | 92.5 | ▲ 1.2 |
| EU | 88.9 | ▼ 0.4 |
| IN | 95.0 | ▲ 4.5 |

<chart-data>{ "type": "line", "title": "LIQUIDITY DRIFT (Q1)", "xLabel": "FISCAL_PERIOD", "yLabel": "INDEX_VALUE", "data": [["Time", "Index"], ["Jan", 90], ["Feb", 92], ["Mar", 95]] }</chart-data>

## 3. SECTOR ALLOCATION

Strategic sector rotation emphasizes high-yield defensive positions and credit-backed fintech growth.

<chart-data>{ "type": "pie", "title": "INSTITUTIONAL ALLOCATION", "data": [["Sector", "Alloc %"], ["Banking", 35], ["Fintech", 25], ["Energy", 20], ["Tech", 20]] }</chart-data>

ABBREVIATIONS:
- EM: Emerging Markets
- DM: Developed Markets
- LFY: Last Financial Year
- RBI: Reserve Bank of India
- FED: Federal Reserve

[SOURCE | Bloomberg Terminal](https://bloomberg.com)
[SOURCE | Reuters Institutional](https://reuters.com)
`;

async function testGeneration() {
  console.log("🚀 [Test] Generating Hardened Sample Article...");
  
  const verticalName = "Global Macro & Cross-Asset Drift";
  const verticalId = "macro";
  const dateLabel = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  
  // 1. Process Sectors
  const processed = sanitizePayload(MOCK_MANUSCRIPT);
  const repaired = repairTables(processed);
  const visualize = injectVisuals(repaired, verticalName, verticalId);
  const final = enforceInstitutionalSections(visualize);

  // 2. Build Multi-Sector Mock Content
  const wrappedContent = `
    <div id="sector-macro" class="institutional-sector">${final}</div>
    <div id="sector-equities" class="institutional-sector"><h2>INSTITUTIONAL ALPHA ROTATION V2</h2><p>Equities performance synthesis...</p></div>
    <div id="sector-debt" class="institutional-sector"><h2>DEBT & LIQUIDITY SURVEILLANCE</h2><p>Credit market surveillance metrics...</p></div>
    <div id="sector-banking" class="institutional-sector"><h2>BANKING FLOWS</h2><p>Banking sector telemetry...</p></div>
  `;
  
  // 3. Render HTML
  const finalHtml = getBaseTemplate({
    title: "MACRO STRATEGIC DRIFT 2026",
    excerpt: "Institutional synthesis of cross-asset volatility and liquidity divergence.",
    content: wrappedContent,
    dateLabel,
    freq: "weekly",
    fileName: "test-hardened-article.html"
  });

  // 3. Write to Articles directory
  const articlesDir = path.join(__dirname, "../articles/weekly");
  if (!fs.existsSync(articlesDir)) fs.mkdirSync(articlesDir, { recursive: true });
  
  const filePath = path.join(articlesDir, "test-hardened-article.html");
  fs.writeFileSync(filePath, finalHtml);
  
  console.log(`✅ [Test] Demo Article created: ${filePath}`);
}

testGeneration().catch(console.error);
