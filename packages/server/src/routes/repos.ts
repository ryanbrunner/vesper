import { Hono } from 'hono';
import { CreateRepoBody } from '@vesper/shared';
import type { Db } from '../db/client.js';
import { RepoInUseError, ValidationError, createRepo, deleteRepo, listRepos } from '../db/queries.js';

export function repoRoutes(db: Db) {
  const routes = new Hono();

  routes.get('/', (c) => c.json(listRepos(db)));

  routes.post('/', async (c) => {
    const parsed = CreateRepoBody.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'invalid body', detail: parsed.error.issues[0]?.message }, 400);
    }
    try {
      return c.json(createRepo(db, parsed.data), 201);
    } catch (e) {
      if (e instanceof ValidationError) return c.json({ error: 'invalid repo', detail: e.message }, 400);
      throw e;
    }
  });

  routes.delete('/:id', (c) => {
    try {
      deleteRepo(db, c.req.param('id'));
      return c.json({ ok: true });
    } catch (e) {
      if (e instanceof RepoInUseError) return c.json({ error: 'repo is in use', detail: e.message }, 409);
      throw e;
    }
  });

  return routes;
}
