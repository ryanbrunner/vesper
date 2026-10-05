import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Options, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { createRepo, createTask, getLatestRun } from '../db/queries.js';
import { testDb, testRepoDir } from '../routes/test-helpers.js';
import { cancelRun, runTask, type QueryFn } from './claude.js';

function setUp() {
  const db = testDb();
  const repo = createRepo(db, { name: 'vesper', path: testRepoDir() });
  const task = createTask(db, { name: 'nightly', prompt: 'do the thing', repoId: repo.id, schedule: '0 2 * * *' });
  return { db, task };
}

const init: SDKMessage = { type: 'system', subtype: 'init', permissionMode: 'auto' } as SDKMessage;

/** A fake SDK that yields exactly the messages given, then ends. */
function scripted(messages: SDKMessage[]): QueryFn {
  return (() => {
    async function* gen() {
      for (const m of messages) yield m;
    }
    return gen();
  }) as unknown as QueryFn;
}

/** A fake SDK that throws instead of ever yielding a result. */
function failing(err: Error): QueryFn {
  return (() => {
    async function* gen(): AsyncGenerator<SDKMessage> {
      yield init;
      throw err;
    }
    return gen();
  }) as unknown as QueryFn;
}

/** A fake SDK that hangs after `init` until its own abortController fires. */
function hanging(): QueryFn {
  return (({ options }: { prompt: string | AsyncIterable<SDKUserMessage>; options: Options }) => {
    async function* gen(): AsyncGenerator<SDKMessage> {
      const signal = options.abortController!.signal;
      const aborted = new Promise<never>((_, reject) => {
        if (signal.aborted) reject(new Error('aborted by user'));
        else signal.addEventListener('abort', () => reject(new Error('aborted by user')));
      });
      yield init;
      await aborted;
    }
    return gen();
  }) as unknown as QueryFn;
}

test('a successful run records the result, cost and usage', async () => {
  const { db, task } = setUp();
  const result = {
    type: 'result',
    subtype: 'success',
    result: 'all done',
    total_cost_usd: 0.05,
    usage: { input_tokens: 10, output_tokens: 20 },
    num_turns: 3,
  } as unknown as SDKMessage;

  const { run, done } = runTask(db, task.id, 'manual', scripted([init, result]));
  assert.equal(run.status, 'running');
  await done;

  const latest = getLatestRun(db, task.id);
  assert.equal(latest?.status, 'succeeded');
  assert.equal(latest?.resultText, 'all done');
  assert.equal(latest?.totalCostUsd, 0.05);
  assert.deepEqual(latest?.usage, { input_tokens: 10, output_tokens: 20 });
  assert.equal(latest?.numTurns, 3);
  assert.equal(latest?.errorMessage, null);
  assert.ok(latest?.finishedAt);
});

test('a non-success result subtype fails the run', async () => {
  const { db, task } = setUp();
  const result = { type: 'result', subtype: 'error_max_turns', num_turns: 50 } as unknown as SDKMessage;

  const { done } = runTask(db, task.id, 'manual', scripted([init, result]));
  await done;

  const latest = getLatestRun(db, task.id);
  assert.equal(latest?.status, 'failed');
  assert.match(latest?.errorMessage ?? '', /error_max_turns/);
});

test('an error thrown mid-stream fails the run', async () => {
  const { db, task } = setUp();
  const { done } = runTask(db, task.id, 'manual', failing(new Error('ECONNRESET')));
  await done;

  const latest = getLatestRun(db, task.id);
  assert.equal(latest?.status, 'failed');
  assert.match(latest?.errorMessage ?? '', /ECONNRESET/);
});

test('cancelRun stops an in-flight run', async () => {
  const { db, task } = setUp();
  const { run, done } = runTask(db, task.id, 'manual', hanging());

  assert.equal(cancelRun(run.id), true);
  await done;

  const latest = getLatestRun(db, task.id);
  assert.equal(latest?.status, 'cancelled');
});

test('cancelRun on an unknown run id returns false', () => {
  assert.equal(cancelRun('no-such-run'), false);
});

test('runTask throws for an unknown task id', () => {
  const { db } = setUp();
  assert.throws(() => runTask(db, 'no-such-task', 'manual', scripted([])));
});
