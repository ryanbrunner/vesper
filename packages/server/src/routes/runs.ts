import { Hono } from 'hono';
import { cancelRun } from '../runs/claude.js';

export function runRoutes() {
  const routes = new Hono();

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
