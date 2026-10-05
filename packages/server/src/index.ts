import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import { config } from './config.js';
import { openDatabase } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { repoRoutes } from './routes/repos.js';
import { taskRoutes } from './routes/tasks.js';

/**
 * Pure: opens the database, runs migrations and mounts routes, nothing else.
 * No timer and no file write belongs in here — startServer is where booting
 * actually happens, so a spike that only needs an app can build one without
 * side effects it didn't ask for.
 */
export function createApp() {
  const db = openDatabase(config.dbFile);
  runMigrations(db);

  const app = new Hono();
  app.route('/api/repos', repoRoutes(db));
  app.route('/api/tasks', taskRoutes(db));
  app.get('/healthz', (c) => c.json({ ok: true }));

  // In production the built frontend is served from the same origin and port.
  // In dev, Vite serves it and proxies /api here, so this is absent and skipped.
  if (existsSync(config.webDist)) {
    const rel = `./${relative(process.cwd(), config.webDist)}`;
    app.use('/*', serveStatic({ root: rel }));
    app.get('*', serveStatic({ path: `${rel}/index.html` }));
  }

  return { app, db };
}

/** Builds the app and serves it, resolving with the URL once it is listening. */
export function startServer({ port = config.port }: { port?: number } = {}): Promise<string> {
  const { app } = createApp();

  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port, hostname: config.hostname }, (info) => {
      const url = `http://${config.hostname}:${info.port}`;
      console.log(`[vesper] ${url}`);
      console.log(`[vesper] database: ${config.dbFile}`);
      resolve(url);
    });
    server.once('error', reject);
  });
}

export { config };
