import { Hono } from 'hono';
import type { Db } from '../db/client.js';
import { getRun } from '../db/queries.js';
import { cancelRun } from '../runs/claude.js';

export function runRoutes(db: Db) {
  const routes = new Hono();

  // The run detail view's one call: resultText, errorMessage and the
  // transcript, none of which the list or latest-run shapes carry.
  routes.get('/:id', (c) => {
    const found = getRun(db, c.req.param('id'));
    if (!found) return c.json({ error: 'not found' }, 404);
    return c.json(found);
  });

  // 404 for a run id never seen, 200 for a run that was in flight and has now
  // been asked to stop. The row itself turns `cancelled` asynchronously, once
  // the SDK's own abort has unwound — this only confirms the ask landed.
  routes.post('/:id/cancel', (c) => {
    const found = cancelRun(c.req.param('id'));
    if (!found) return c.json({ error: 'not found' }, 404);
    return c.json({ ok: true });
  });

  return routes;
}
