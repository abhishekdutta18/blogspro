#!/usr/bin/env node
/**
 * Prints the last 24 hours of estimated AI token spend from the pipeline's token ledger, grouped by run
 * frequency and call role, against the current caps. Read-only; no network, no AI.
 *   npm run token-report            (ledger from TOKEN_LEDGER_FILE / STATE_DIRECTORY / ~/.blogspro)
 *   node scripts/token-report.js /var/lib/blogspro-pulse/token-ledger.json
 */
import { DEFAULT_RUN_CAPS, ledgerFile, readLedger, resolveCaps, summarizeLedger } from './lib/token-budget.js';

const file = process.argv[2] || ledgerFile(process.env);
const { total, rows } = summarizeLedger(readLedger(file));
const fmt = (n) => n.toLocaleString('en-GB');
const { dayCap } = resolveCaps('daily', process.env);

const lines = [
  `Token ledger: ${file}`,
  `Last 24 h: ${fmt(total.tokens)} of ${fmt(dayCap)} estimated tokens (${fmt(total.in)} in, ${fmt(total.out)} out) in ${total.calls} calls`,
  '',
  `${'run'.padEnd(8)} ${'role'.padEnd(10)} ${'calls'.padStart(5)} ${'in'.padStart(9)} ${'out'.padStart(9)} ${'total'.padStart(9)}`,
  ...rows.map((r) => `${r.freq.padEnd(8)} ${r.role.padEnd(10)} ${String(r.calls).padStart(5)} ${fmt(r.in).padStart(9)} ${fmt(r.out).padStart(9)} ${fmt(r.tokens).padStart(9)}`),
  '',
  `Per-run caps: ${Object.keys(DEFAULT_RUN_CAPS).map((f) => `${f} ${fmt(resolveCaps(f, process.env).runCap)}`).join(', ')}`,
];
process.stdout.write(`${lines.join('\n')}\n`);
