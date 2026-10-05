import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRepo, createTask, insertRun } from '../db/queries.js';
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

test('GET /:id/runs is empty before anything has run', async () => {
  const { routes, task } = app();
  const res = await routes.request(`/${task.id}/runs`);
  assert.equal(res.status, 200);
  assert.deepEqual(await json(res), []);
});

test('GET /:id/runs lists every run, newest first', async () => {
  const { db, routes, task } = app();
  insertRun(db, { id: 'run-1', taskId: task.id, trigger: 'manual', startedAt: new Date(2024, 0, 1) });
  insertRun(db, { id: 'run-2', taskId: task.id, trigger: 'scheduled', startedAt: new Date(2024, 0, 2) });

  const res = await routes.request(`/${task.id}/runs`);
  const body = await json(res);
  assert.deepEqual(body.map((r: { id: string }) => r.id), ['run-2', 'run-1']);
});
