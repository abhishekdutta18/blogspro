/**
 * index.js — starts the BlogsPro API on loopback; nginx is the only public entry point.
 */
import { createServer } from 'node:http';
import { loadConfig } from './src/config.js';
import { createApp } from './src/app.js';
import { log } from './src/http.js';

const HOUR = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30_000;

const config = loadConfig();
if (config.adminEmails.length === 0) log('warn', 'ADMIN_EMAILS is empty: nobody can become admin.');
for (const [name, provider] of Object.entries(config.providers)) {
  if (!provider) log('warn', `${name} sign-in is off: set ${name.toUpperCase()}_CLIENT_ID and _CLIENT_SECRET.`);
}

const app = createApp(config);
const server = createServer({ requestTimeout: REQUEST_TIMEOUT_MS }, app.handle);
const purge = setInterval(() => app.sessions.purgeExpired(), HOUR);

server.listen(config.port, config.host, () => log('info', 'blogspro-api listening', { host: config.host, port: config.port }));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    clearInterval(purge);
    server.close(() => {
      app.db.close();
      process.exit(0);
    });
  });
}
