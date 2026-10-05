import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRepo, createTask, insertRun, setRunStatus } from '../db/queries.js';
import { runRoutes } from './runs.js';
import { json, testDb, testRepoDir } from './test-helpers.js';

function app() {
  const db = testDb();
  const repo = createRepo(db, { name: 'vesper', path: testRepoDir() });
  const task = createTask(db, { name: 'nightly', prompt: 'do the thing', repoId: repo.id, schedule: '0 2 * * *' });
  return { db, task, routes: runRoutes(db) };
}

test('GET /:id 404s for a run id never seen', async () => {
  const { routes } = app();
  const res = await routes.request('/no-such-run');
  assert.equal(res.status, 404);
});

test('GET /:id returns the run with its transcript', async () => {
  const { db, task, routes } = app();
  const run = insertRun(db, { id: 'run-1', taskId: task.id, trigger: 'manual', startedAt: new Date() });
  const transcript = [{ type: 'assistant', message: { role: 'assistant', content: 'hi' } }];
  setRunStatus(db, run.id, { status: 'succeeded', resultText: 'done', transcriptJson: transcript });

  const res = await routes.request(`/${run.id}`);
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.equal(body.resultText, 'done');
  assert.deepEqual(body.transcript, transcript);
});

test('POST /:id/cancel 404s for a run id never seen', async () => {
  const { routes } = app();
  const res = await routes.request('/no-such-run/cancel', { method: 'POST' });
  assert.equal(res.status, 404);
});
