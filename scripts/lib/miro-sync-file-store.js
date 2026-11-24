// miro-sync-file-store.js — durable key/value byte store on local disk for the VPS MiroSync service.
// Writes go to a temp file, are fsynced, then renamed over the target, so a crash mid-write leaves
// the previous snapshot intact.
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SAFE_KEY = /^[a-z0-9_-]+$/i;

/**
 * @param {string} dir absolute directory that holds one `<key>.yjs` file per key
 * @returns {{ get(key: string): Promise<Uint8Array|undefined>, put(key: string, bytes: Uint8Array): Promise<void> }}
 */
export function createFileStore(dir) {
  const fileFor = (key) => {
    if (!SAFE_KEY.test(key)) throw new Error(`Invalid storage key: ${key}`);
    return path.join(dir, `${key}.yjs`);
  };

  return {
    async get(key) {
      try {
        return new Uint8Array(await fs.readFile(fileFor(key)));
      } catch (err) {
        if (err.code === 'ENOENT') return undefined;
        throw err;
      }
    },

    async put(key, bytes) {
      const target = fileFor(key);
      const tmp = `${target}.${process.pid}.tmp`;
      await fs.mkdir(dir, { recursive: true });
      const handle = await fs.open(tmp, 'w');
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(tmp, target);
    },
  };
}
