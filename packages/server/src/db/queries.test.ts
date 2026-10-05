import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testDb, testRepoDir } from '../routes/test-helpers.js';
import { createRepo, createTask, failOrphanedRuns, getLatestRun, insertRun } from './queries.js';

test('failOrphanedRuns fails any run still marked running, and leaves finished ones alone', () => {
  const db = testDb();
  const repo = createRepo(db, { name: 'vesper', path: testRepoDir() });
  const task = createTask(db, { name: 'nightly', prompt: 'do the thing', repoId: repo.id, schedule: '0 2 * * *' });
  insertRun(db, { id: crypto.randomUUID(), taskId: task.id, trigger: 'manual', startedAt: new Date() });

  failOrphanedRuns(db);

  const latest = getLatestRun(db, task.id);
  assert.equal(latest?.status, 'failed');
  assert.match(latest?.errorMessage ?? '', /restarted/);
});
