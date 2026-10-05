import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testDb, testRepoDir } from '../routes/test-helpers.js';
import { createRepo, createTask, failOrphanedRuns, getLatestRun, getToolUsage, insertRun, setRunStatus } from './queries.js';

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

function toolUseMessage(name: string) {
  return { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name, input: {} }] } };
}

test('getToolUsage tallies every built-in tool_use call under one Other bucket', () => {
  const db = testDb();
  const repo = createRepo(db, { name: 'vesper', path: testRepoDir() });
  const task = createTask(db, { name: 'nightly', prompt: 'do the thing', repoId: repo.id, schedule: '0 2 * * *' });

  const run1 = insertRun(db, { id: 'run-1', taskId: task.id, trigger: 'manual', startedAt: new Date() });
  setRunStatus(db, run1.id, { transcriptJson: [toolUseMessage('Read'), toolUseMessage('Bash')] });
  const run2 = insertRun(db, { id: 'run-2', taskId: task.id, trigger: 'manual', startedAt: new Date() });
  setRunStatus(db, run2.id, { transcriptJson: [toolUseMessage('Read')] });

  const usage = getToolUsage(db, task.id);
  assert.deepEqual(usage, [{ name: 'Other', callCount: 3, runCount: 2 }]);
});

test('getToolUsage groups an mcp__<server>__<tool> call under its server, and buckets everything else as Other', () => {
  const db = testDb();
  const repo = createRepo(db, { name: 'vesper', path: testRepoDir() });
  const task = createTask(db, { name: 'nightly', prompt: 'do the thing', repoId: repo.id, schedule: '0 2 * * *' });

  const run = insertRun(db, { id: 'run-1', taskId: task.id, trigger: 'manual', startedAt: new Date() });
  setRunStatus(db, run.id, {
    transcriptJson: [toolUseMessage('mcp__slack__send_message'), toolUseMessage('mcp__slack__list_channels'), toolUseMessage('Write')],
  });

  const usage = getToolUsage(db, task.id);
  assert.deepEqual(usage, [
    { name: 'slack', callCount: 2, runCount: 1 },
    { name: 'Other', callCount: 1, runCount: 1 },
  ]);
});

test('getToolUsage is empty for a task with no runs', () => {
  const db = testDb();
  const repo = createRepo(db, { name: 'vesper', path: testRepoDir() });
  const task = createTask(db, { name: 'nightly', prompt: 'do the thing', repoId: repo.id, schedule: '0 2 * * *' });

  assert.deepEqual(getToolUsage(db, task.id), []);
});
