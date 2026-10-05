import { Hono } from 'hono';
import type { ModelsResponse } from '@vesper/shared';
import { listModels } from '../runs/models.js';

export function modelRoutes() {
  const routes = new Hono();

  // Asked of the CLI once per process, so only the first call after boot can
  // be slow. An empty list is an answer: the pickers offer "Default" only.
  routes.get('/', async (c) => {
    const body: ModelsResponse = { models: await listModels() };
    return c.json(body);
  });

  return routes;
}
