import { Hono } from 'hono';
import { CreateTaskBody, UpdateTaskBody } from '@vesper/shared';
import type { Db } from '../db/client.js';
import {
  ValidationError,
  createTask,
  deleteTask,
  getApiTask,
  getLatestRun,
  listTasks,
  setTaskEnabled,
  updateTask,
} from '../db/queries.js';
import { TaskNotFoundError, runTask } from '../runs/claude.js';

export function taskRoutes(db: Db) {
  const routes = new Hono();

  routes.get('/', (c) => c.json(listTasks(db)));

  routes.post('/', async (c) => {
    const parsed = CreateTaskBody.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'invalid body', detail: parsed.error.issues[0]?.message }, 400);
    }
    try {
      const created = createTask(db, parsed.data);
      return c.json(getApiTask(db, created.id), 201);
    } catch (e) {
      if (e instanceof ValidationError) return c.json({ error: 'invalid task', detail: e.message }, 400);
      throw e;
    }
  });

  routes.patch('/:id', async (c) => {
    const parsed = UpdateTaskBody.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'invalid body', detail: parsed.error.issues[0]?.message }, 400);
    }
    try {
      const updated = updateTask(db, c.req.param('id'), parsed.data);
      if (!updated) return c.json({ error: 'not found' }, 404);
      return c.json(getApiTask(db, updated.id));
    } catch (e) {
      if (e instanceof ValidationError) return c.json({ error: 'invalid task', detail: e.message }, 400);
      throw e;
    }
  });

  // Kept separate from PATCH, the way Reeve's actions.ts separates actions
  // from field edits: pausing a task is never re-validated against its repo
  // or schedule, so a repo that's gone missing can't block pausing a task
  // that already pointed at it.
  routes.post('/:id/pause', (c) => {
    const updated = setTaskEnabled(db, c.req.param('id'), false);
    if (!updated) return c.json({ error: 'not found' }, 404);
    return c.json(getApiTask(db, updated.id));
  });

  routes.post('/:id/resume', (c) => {
    const updated = setTaskEnabled(db, c.req.param('id'), true);
    if (!updated) return c.json({ error: 'not found' }, 404);
    return c.json(getApiTask(db, updated.id));
  });

  routes.delete('/:id', (c) => {
    deleteTask(db, c.req.param('id'));
    return c.json({ ok: true });
  });

  // 202, not 200 or 201: nothing created here has finished, and the run
  // itself can take minutes. The row returned is the `running` one.
  routes.post('/:id/run', (c) => {
    try {
      const { run } = runTask(db, c.req.param('id'), 'manual');
      return c.json(run, 202);
    } catch (e) {
      if (e instanceof TaskNotFoundError) return c.json({ error: 'not found' }, 404);
      throw e;
    }
  });

  routes.get('/:id/latest-run', (c) => c.json(getLatestRun(db, c.req.param('id'))));

  return routes;
}
