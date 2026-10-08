import { Hono } from 'hono';
import { CreateRepoBody, INTEGRATION_LABELS, titleCase, type McpServersResponse } from '@vesper/shared';
import type { Db } from '../db/client.js';
import { RepoInUseError, ValidationError, createRepo, deleteRepo, getRepo, listRepos } from '../db/queries.js';
import { listMcpServers } from '../runs/mcpServers.js';

export function repoRoutes(db: Db) {
  const routes = new Hono();

  routes.get('/', (c) => c.json(listRepos(db)));

  // The picker's one call, once a repo is chosen: which MCP servers that
  // repo has configured, and whether each is ready to pre-approve or still
  // pending/failed/needing auth.
  routes.get('/:id/mcp-servers', async (c) => {
    const repo = getRepo(db, c.req.param('id'));
    if (!repo) return c.json({ error: 'not found' }, 404);
    const servers = await listMcpServers(repo.path);
    const body: McpServersResponse = {
      servers: servers.map((s) => ({ name: s.name, label: INTEGRATION_LABELS[s.name] ?? titleCase(s.name), status: s.status })),
    };
    return c.json(body);
  });

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
