/**
 * Local TimesFM, the fallback when BigQuery AI.FORECAST fails: runs scripts/lib/home-forecasts/timesfm_local.py
 * in its own Python virtualenv on this server (deploy/vps/README.md, "Local TimesFM").
 *
 * Note on CLAUDE.md's "no local AI fallbacks" rule: that rule is about the LLM fleet. This is a numeric
 * time-series model, used only for data/forecasts.json, and only after BigQuery failed (the owner asked for it).
 *
 *   localForecaster({ python, script, timeoutMs }) -> forecast(series, horizon) -> { model, forecasts: Map(id -> [{ step, value, lower, upper }]) }
 * series: [{ id, values: [number] }] oldest first. lower/upper are the 0.1 and 0.9 quantiles (an 80% interval,
 * matching the BigQuery forecasts).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOCAL_PYTHON = process.env.TIMESFM_PYTHON || '/opt/blogspro-timesfm/venv/bin/python';
export const LOCAL_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'timesfm_local.py');
const TIMEOUT_MS = 6 * 60 * 1000; // first run loads the checkpoint from disk; later runs take seconds
const MAX_OUTPUT = 4 * 1024 * 1024;

const round = (n) => Number(n.toPrecision(6));

/** Map(id -> steps) from the script's JSON reply, keeping only finite, ordered bounds. */
export function parseLocalReply(text) {
  const reply = JSON.parse(text);
  const byId = new Map();
  Object.entries(reply?.forecasts ?? {}).forEach(([id, steps]) => {
    const clean = (Array.isArray(steps) ? steps : [])
      .map((s, i) => ({ step: i + 1, value: Number(s?.value), lower: Number(s?.lower), upper: Number(s?.upper) }))
      .filter((s) => [s.value, s.lower, s.upper].every(Number.isFinite))
      .map((s) => ({ step: s.step, value: round(s.value), lower: round(Math.min(s.lower, s.value)), upper: round(Math.max(s.upper, s.value)) }));
    if (clean.length) byId.set(id, clean);
  });
  return { model: typeof reply?.model === 'string' ? reply.model.slice(0, 80) : 'TimesFM (local)', forecasts: byId };
}

/** Runs the script with `input` on stdin; resolves with stdout, rejects on exit code, timeout or overflow. */
function runScript(python, script, input, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONUNBUFFERED: '1' } });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`local TimesFM timed out after ${timeoutMs / 1000}s`)); }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (out.length > MAX_OUTPUT) child.kill('SIGKILL');
    });
    child.stderr.on('data', (chunk) => { err = (err + chunk).slice(-2000); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`local TimesFM exited ${code}: ${err.trim().split('\n').at(-1) ?? ''}`));
    });
    child.stdin.end(input);
  });
}

export function localForecaster({ python = LOCAL_PYTHON, script = LOCAL_SCRIPT, timeoutMs = TIMEOUT_MS, run = runScript } = {}) {
  return async (series, horizon) => {
    const input = JSON.stringify({ horizon, series: series.map(({ id, values }) => ({ id, values })) });
    const reply = parseLocalReply(await run(python, script, input, timeoutMs));
    if (reply.forecasts.size === 0) throw new Error('local TimesFM returned no forecasts');
    return reply;
  };
}
