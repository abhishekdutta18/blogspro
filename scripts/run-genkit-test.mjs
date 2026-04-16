import { institutionalSummaryFlow } from './genkit-pilot-flow.mjs';

async function runTest() {
  const vertical = process.argv[2] || 'Banking & Financial Services';
  
  // Enable Institutional Dry-Run for logic verification
  process.env.DRY_RUN = 'true';
  
  console.log(`📡 [Test] Executing Genkit Pilot Flow for: ${vertical} (DRY_RUN: ACTIVE)...`);
  
  try {
    const result = await institutionalSummaryFlow({ vertical });
    console.log(`\n✅ [Test] Flow Execution Successful!\n`);
    console.log(`--- INSTITUTIONAL SUMMARY ---\n`);
    console.log(result);
    console.log(`\n-----------------------------\n`);
    process.exit(0);
  } catch (error) {
    console.error(`❌ [Test] Flow Execution Failed:`, error.message);
    process.exit(1);
  }
}

runTest();
