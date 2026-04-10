import { initNodeSentry, logSwarmPulse, flushSentry } from './lib/sentry-bridge.js';
import dotenv from 'dotenv';
dotenv.config();

/**
 * test-telemetry-uplink.js
 * ------------------------
 * Verifies Sentry connectivity and secret standardization.
 */
async function testUplink() {
    console.log("📡 Testing BlogsPro Telemetry Uplink...");
    
    const dsn = process.env.SENTRY_DSN;
    console.log(`🔍 DSN Detected: ${dsn ? dsn.substring(0, 20) + '...' : 'MISSING'}`);
    
    // 1. Initialize
    await initNodeSentry(dsn, 'test-verification');
    
    // 2. Log Heartbeat
    console.log("💓 Dispatching Swarm Heartbeat [Institutional Audit]...");
    await logSwarmPulse('info', 'Zero-Failure Hardening Verification', {
        test_id: 'verification-cycle-10.6',
        machine: 'local-institutional-node',
        auth: process.env.TELEGRAM_BOT_TOKEN ? 'Standardized' : 'Missing'
    });
    
    // 3. Forced Flush
    console.log("🚿 Flushing Telemetry Buffers...");
    await flushSentry();
    
    console.log("✅ Telemetry test cycle complete.");
}

testUplink().catch(console.error);
