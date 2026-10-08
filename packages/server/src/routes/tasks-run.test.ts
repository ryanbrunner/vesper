import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRepo, createTask, insertRun, setRunStatus } from '../db/queries.js';
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

test('POST /:id/run returns 409 while the task\'s latest run is still running', async () => {
  const { db, routes, task } = app();
  insertRun(db, { id: 'run-1', taskId: task.id, trigger: 'manual', startedAt: new Date() });

  const res = await routes.request(`/${task.id}/run`, { method: 'POST' });
  assert.equal(res.status, 409);
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

test('GET /:id 404s for a task id never seen', async () => {
  const { routes } = app();
  const res = await routes.request('/no-such-task');
  assert.equal(res.status, 404);
});

test('GET /:id returns the task', async () => {
  const { routes, task } = app();
  const res = await routes.request(`/${task.id}`);
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.equal(body.id, task.id);
  assert.equal(body.name, task.name);
});

test('GET /:id/tool-usage tallies tool_use calls across the task\'s runs', async () => {
  const { db, routes, task } = app();
  const run = insertRun(db, { id: 'run-1', taskId: task.id, trigger: 'manual', startedAt: new Date() });
  setRunStatus(db, run.id, {
    transcriptJson: [{ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: {} }] } }],
  });

  const res = await routes.request(`/${task.id}/tool-usage`);
  assert.equal(res.status, 200);
  assert.deepEqual(await json(res), [{ name: 'Other', callCount: 1, runCount: 1 }]);
});
