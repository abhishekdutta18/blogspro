/**
 * Tests for the fire-and-forget telemetry writer. The contract that matters:
 * the publish path never waits on telemetry and never sees it throw (one
 * SWARM_QA_COMPLETE write once held a run for ~11 minutes).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from '../migrate.js';
import { createTelemetryWriter } from '../telemetry.js';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

let db;
let logger;

const never = () => new Promise(() => {});
const rows = async () => (await db.query('select * from telemetry_events order by id')).rows;

beforeAll(async () => {
  db = new PGlite();
  await migrate(db, { dir: MIGRATIONS });
});
afterAll(async () => db.close());
beforeEach(async () => {
  await db.query('delete from telemetry_events');
  logger = { warn: vi.fn() };
});

describe('createTelemetryWriter', () => {
  it('stores an event with its metadata mapped to columns', async () => {
    const telemetry = createTelemetryWriter({ db, logger });

    telemetry.record('SWARM_QA_COMPLETE', {
      frequency: 'hourly', jobId: 'job-1', status: 'success', message: 'qa ok',
      details: { score: 0.92 }, timestamp: '2026-11-20T10:00:00.000Z',
    });
    await telemetry.flush();

    const [row] = await rows();
    expect(row).toMatchObject({
      event: 'SWARM_QA_COMPLETE', frequency: 'hourly', job_id: 'job-1',
      status: 'success', message: 'qa ok', details: { score: 0.92 },
    });
    expect(new Date(row.occurred_at).toISOString()).toBe('2026-11-20T10:00:00.000Z');
    expect(telemetry.stats()).toEqual({ written: 1, dropped: 0 });
  });

  it('returns synchronously even when the database hangs forever', () => {
    const telemetry = createTelemetryWriter({ db: { query: never }, logger, timeoutMs: 50 });

    const started = Date.now();
    const result = telemetry.record('SWARM_QA_COMPLETE');

    expect(result).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(20);
  });

  it('gives up on a hung write after timeoutMs and counts it as dropped', async () => {
    const telemetry = createTelemetryWriter({ db: { query: never }, logger, timeoutMs: 50 });

    telemetry.record('E1');
    const started = Date.now();
    await telemetry.flush();

    expect(Date.now() - started).toBeLessThan(1000);
    expect(telemetry.stats()).toEqual({ written: 0, dropped: 1 });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('timed out'));
  });

  it('never throws or leaks a rejection when the write fails', async () => {
    const failing = { query: () => Promise.reject(new Error('RESOURCE_EXHAUSTED')) };
    const telemetry = createTelemetryWriter({ db: failing, logger });
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    expect(() => telemetry.record('E1')).not.toThrow();
    await telemetry.flush();
    await new Promise((r) => setTimeout(r, 10));
    process.off('unhandledRejection', unhandled);

    expect(unhandled).not.toHaveBeenCalled();
    expect(telemetry.stats().dropped).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('RESOURCE_EXHAUSTED'));
  });

  it('drops new events once maxInFlight writes are pending', async () => {
    const telemetry = createTelemetryWriter({ db: { query: never }, logger, timeoutMs: 50, maxInFlight: 2 });

    telemetry.record('E1');
    telemetry.record('E2');
    telemetry.record('E3');

    expect(telemetry.stats().dropped).toBe(1);
    await telemetry.flush();
    expect(telemetry.stats().dropped).toBe(3);
  });

  it('ignores an empty event name with a warning', async () => {
    const telemetry = createTelemetryWriter({ db, logger });

    telemetry.record('');
    await telemetry.flush();

    expect(await rows()).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('stores unserializable details as a marker instead of failing', async () => {
    const telemetry = createTelemetryWriter({ db, logger });
    const circular = {};
    circular.self = circular;

    telemetry.record('E1', { details: circular });
    await telemetry.flush();

    expect((await rows())[0].details).toEqual({ unserializable: true });
  });

  it('applies defaults for missing metadata', async () => {
    const telemetry = createTelemetryWriter({ db, logger });

    telemetry.record('E1');
    await telemetry.flush();

    expect((await rows())[0]).toMatchObject({ frequency: 'unknown', status: 'info', job_id: null, message: null, details: {} });
  });
});
