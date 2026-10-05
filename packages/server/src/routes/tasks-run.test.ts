import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRepo, createTask } from '../db/queries.js';
import { taskRoutes } from './tasks.js';
import { json, testDb, testRepoDir } from './test-helpers.js';

function app() {
  const db = testDb();
  const repo = createRepo(db, { name: 'vesper', path: testRepoDir() });
  const task = createTask(db, { name: 'nightly', prompt: 'do the thing', repoId: repo.id, schedule: '0 2 * * *' });
  return { db, task, routes: taskRoutes(db) };
}

test('POST /:id/run on an unknown task returns 404', async () => {
  const { routes } = app();
  const res = await routes.request('/no-such-task/run', { method: 'POST' });
  assert.equal(res.status, 404);
});

test('GET /:id/latest-run is null before anything has run', async () => {
  const { routes, task } = app();
  const res = await routes.request(`/${task.id}/latest-run`);
  assert.equal(res.status, 200);
  assert.equal(await json(res), null);
});
