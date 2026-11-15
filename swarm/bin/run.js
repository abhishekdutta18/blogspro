#!/usr/bin/env node
/**
 * run.js — CLI entry for the systemd timer.
 *   node bin/run.js --freq=hourly            run and publish
 *   node bin/run.js --freq=hourly --dry-run  run everything, write nothing, print the briefing
 * Exit codes: 0 ok, 1 run aborted or failed, 2 bad usage or config.
 */
import { loadConfig, ConfigError } from '../src/config.js';
import { createLogger } from '../src/log.js';
import { createFleet } from '../src/llm/fleet.js';
import { openBriefingStore } from '../src/store/briefings.js';
import { runHourly } from '../src/run-hourly.js';

const SUPPORTED = new Set(['hourly']);

async function main(argv, env) {
  const log = createLogger();
  const freq = argv.find(a => a.startsWith('--freq='))?.split('=')[1];
  const dryRun = argv.includes('--dry-run');
  if (!SUPPORTED.has(freq)) {
    log.error('usage', { message: `--freq must be one of: ${[...SUPPORTED].join(', ')}`, got: freq ?? null });
    return 2;
  }

  let config;
  try {
    config = loadConfig(env);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    log.error('config.invalid', { message: error.message });
    return 2;
  }

  const fleet = createFleet({ providers: config.providers, timeoutMs: config.llmTimeoutMs, pauseMs: config.fleetPauseMs, log });
  const store = dryRun ? null : openBriefingStore(config.dbPath);
  try {
    const briefing = await runHourly({ config, fleet, store, now: Date.now(), log });
    if (dryRun) process.stdout.write(`${JSON.stringify(briefing, null, 2)}\n`);
    log.info('run.done', { slot: briefing.id, dryRun });
    return 0;
  } catch (error) {
    log.error('run.failed', { reason: error.reason || error.name, message: error.message, attempts: error.attempts?.length });
    return 1;
  } finally {
    store?.close();
  }
}

process.exitCode = await main(process.argv.slice(2), process.env);
