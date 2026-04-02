import { Connection, Client } from '@temporalio/client';
import { PulseSwarmWorkflow } from '../temporal/workflows.js';

/**
 * Trigger Durable Swarm Workflow
 * Usage: node scripts/trigger-durable-swarm.mjs "Topic" "SYMBOL"
 */

async function run() {
  const topic = process.argv[2] || 'Global Market Trends 2026';
  const symbol = process.argv[3] || 'NIFTY';

  const connection = await Connection.connect({ address: 'localhost:7233' });
  const client = new Client({ connection });

  console.log(`🚀 Triggering Durable Swarm for Topic: ${topic}...`);

  const handle = await client.workflow.start(PulseSwarmWorkflow, {
    taskQueue: 'blogspro-swarm',
    args: [{ topic, symbol }],
    workflowId: `swarm-${Date.now()}`,
  });

  console.log(`✅ Workflow started successfully!`);
  console.log(`Workflow ID: ${handle.workflowId}`);
  console.log(`View progress at: http://localhost:8233/namespaces/default/workflows/${handle.workflowId}`);

  const result = await handle.result();
  console.log('🏁 Workflow Result:', result);
}

run().catch((err) => {
  console.error('❌ Failed to trigger swarm:', err);
  process.exit(1);
});
