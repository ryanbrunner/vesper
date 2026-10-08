import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CreateTaskBody } from '@vesper/shared';
import { testDb, testRepoDir } from '../routes/test-helpers.js';
import { createRepo, createTask, failOrphanedRuns, getApiTask, getLatestRun, getToolUsage, insertRun, setRunStatus, updateTask } from './queries.js';

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

test('a task can be created with a pinned model and effort, and they round-trip through the API row', () => {
  const db = testDb();
  const repo = createRepo(db, { name: 'vesper', path: testRepoDir() });
  const task = createTask(db, {
    name: 'nightly',
    prompt: 'do the thing',
    repoId: repo.id,
    schedule: '0 2 * * *',
    model: 'opus',
    effort: 'high',
  });

  const api = getApiTask(db, task.id);
  assert.equal(api?.model, 'opus');
  assert.equal(api?.effort, 'high');
});

test('patching a task back to default resets model and effort to null, not empty string', () => {
  const db = testDb();
  const repo = createRepo(db, { name: 'vesper', path: testRepoDir() });
  const task = createTask(db, {
    name: 'nightly',
    prompt: 'do the thing',
    repoId: repo.id,
    schedule: '0 2 * * *',
    model: 'opus',
    effort: 'high',
  });

  updateTask(db, task.id, { model: null, effort: null });

  const api = getApiTask(db, task.id);
  assert.equal(api?.model, null);
  assert.equal(api?.effort, null);
});

test('a model outside the four fixed aliases is rejected by the schema, not stored', () => {
  const parsed = CreateTaskBody.safeParse({
    name: 'nightly',
    prompt: 'do the thing',
    repoId: 'some-repo',
    schedule: '0 2 * * *',
    model: 'claude-3-opus-20240229',
  });
  assert.equal(parsed.success, false);
});

test('an effort level the schema does not know is rejected, not stored', () => {
  const parsed = CreateTaskBody.safeParse({
    name: 'nightly',
    prompt: 'do the thing',
    repoId: 'some-repo',
    schedule: '0 2 * * *',
    effort: 'ultra',
  });
  assert.equal(parsed.success, false);
});

test('a task created with allowedMcpServers round-trips through createTask and the API row', () => {
  const db = testDb();
  const repo = createRepo(db, { name: 'vesper', path: testRepoDir() });
  const task = createTask(db, {
    name: 'nightly',
    prompt: 'do the thing',
    repoId: repo.id,
    schedule: '0 2 * * *',
    allowedMcpServers: ['slack', 'notion'],
  });

  const api = getApiTask(db, task.id);
  assert.deepEqual(api?.allowedMcpServers, ['slack', 'notion']);
});

test('a task created with no allowedMcpServers keeps it null, not an empty array', () => {
  const db = testDb();
  const repo = createRepo(db, { name: 'vesper', path: testRepoDir() });
  const task = createTask(db, { name: 'nightly', prompt: 'do the thing', repoId: repo.id, schedule: '0 2 * * *' });

  const api = getApiTask(db, task.id);
  assert.equal(api?.allowedMcpServers, null);
});

test('updateTask can set and clear allowedMcpServers independently of other fields', () => {
  const db = testDb();
  const repo = createRepo(db, { name: 'vesper', path: testRepoDir() });
  const task = createTask(db, { name: 'nightly', prompt: 'do the thing', repoId: repo.id, schedule: '0 2 * * *' });

  updateTask(db, task.id, { allowedMcpServers: ['slack'] });
  assert.deepEqual(getApiTask(db, task.id)?.allowedMcpServers, ['slack']);

  updateTask(db, task.id, { allowedMcpServers: null });
  assert.equal(getApiTask(db, task.id)?.allowedMcpServers, null);
});
