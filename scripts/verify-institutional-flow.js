import 'dotenv/config';
import { spawn } from 'child_process';
import path from 'path';

/**
 * 🏺 [V8.5] Institutional E2E Verification Harness
 * ==============================================
 * Validates the entire Local-to-Cloud HIL Consensus Bridge.
 * Bypasses expensive AI tier via --dry-run for 60-second audit.
 */

async function runE2EVerification() {
  console.log("🚀 [E2E] Starting Institutional HIL Bridge Verification...");
  
  const swarmProcess = spawn('/opt/homebrew/bin/node', [
    path.join(process.cwd(), 'scripts/generate-institutional-tome.js'),
    '--freq=weekly',
    '--type=article',
    '--hil',
    '--dry-run'
  ], {
    stdio: 'inherit',
    env: { ...process.env, DEBUG: 'true' }
  });

  console.log("\n---------------------------------------------------------");
  console.log("🏺 CONSTRUCTING INSTITUTIONAL DRAFT (DRY-RUN)...");
  console.log("📡 SIGNALING CLOUD HIL BRIDGE (FIRESTORE & TELEGRAM)...");
  console.log("---------------------------------------------------------\n");

  swarmProcess.on('close', (code) => {
    if (code === 0) {
      console.log("\n✅ [E2E] Institutional verification successful (Handshake Complete).");
    } else {
      console.error(`\n❌ [E2E] Institutional verification failed with code ${code}.`);
    }
  });

  // Keep the process alive to show logs
  process.on('SIGINT', () => swarmProcess.kill());
}

runE2EVerification();
