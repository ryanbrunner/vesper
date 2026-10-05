import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CanUseTool, Options, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { createRepo, createTask, getLatestRun, getRun } from '../db/queries.js';
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
    modelUsage: { 'claude-x': { inputTokens: 10, outputTokens: 20 } },
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
  assert.deepEqual(latest?.modelUsage, { 'claude-x': { inputTokens: 10, outputTokens: 20 } });
  assert.equal(latest?.numTurns, 3);
  assert.equal(latest?.errorMessage, null);
  assert.ok(latest?.finishedAt);
});

test('a run keeps the assistant/user messages for its transcript, and drops everything else', async () => {
  const { db, task } = setUp();
  const assistantMsg = { type: 'assistant', message: { role: 'assistant', content: 'hi' } } as unknown as SDKMessage;
  const userMsg = { type: 'user', message: { role: 'user', content: 'tool result' } } as unknown as SDKMessage;
  const result = { type: 'result', subtype: 'success', result: 'done' } as unknown as SDKMessage;

  const { run, done } = runTask(db, task.id, 'manual', scripted([init, assistantMsg, userMsg, result]));
  await done;

  const detail = getRun(db, run.id);
  assert.deepEqual(detail?.transcript, [assistantMsg, userMsg]);
});

test('a run is scoped to the repo and starts in auto mode, denying every escalated tool', async () => {
  const { db, task } = setUp();
  let seen: { cwd?: string; permissionMode?: string } = {};
  const capture: QueryFn = ((args: { prompt: unknown; options: Options }) => {
    seen = { cwd: args.options.cwd, permissionMode: args.options.permissionMode };
    async function* gen() {
      yield init;
    }
    return gen();
  }) as unknown as QueryFn;

  const { done } = runTask(db, task.id, 'manual', capture);
  await done;

  assert.equal(seen.permissionMode, 'auto');
  assert.ok(seen.cwd);

  // The same canUseTool callback the run actually wired up, exercised directly:
  // a Bash call and a Write call are both denied, synchronously.
  let canUseTool!: CanUseTool;
  const captureCanUseTool: QueryFn = ((args: { prompt: unknown; options: Options }) => {
    canUseTool = args.options.canUseTool!;
    async function* gen() {
      yield init;
    }
    return gen();
  }) as unknown as QueryFn;
  const second = runTask(db, task.id, 'manual', captureCanUseTool);
  await second.done;

  const callOptions = { signal: new AbortController().signal, toolUseID: 'test', requestId: 'test' };
  const bash = await canUseTool('Bash', { command: 'git push' }, callOptions);
  assert.equal(bash?.behavior, 'deny');
  const write = await canUseTool('Write', { file_path: '/etc/passwd' }, callOptions);
  assert.equal(write?.behavior, 'deny');
});

test('a session that does not actually start in auto mode fails the run', async () => {
  const { db, task } = setUp();
  const mismatch = { type: 'system', subtype: 'init', permissionMode: 'default' } as unknown as SDKMessage;
  const { done } = runTask(db, task.id, 'manual', scripted([mismatch]));
  await done;

  const latest = getLatestRun(db, task.id);
  assert.equal(latest?.status, 'failed');
  assert.match(latest?.errorMessage ?? '', /Auto mode/);
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

/** A fake SDK that yields an assistant message after `init`, then hangs until abort. */
function hangingAfterAssistant(assistantMsg: SDKMessage): QueryFn {
  return (({ options }: { prompt: string | AsyncIterable<SDKUserMessage>; options: Options }) => {
    async function* gen(): AsyncGenerator<SDKMessage> {
      const signal = options.abortController!.signal;
      const aborted = new Promise<never>((_, reject) => {
        if (signal.aborted) reject(new Error('aborted by user'));
        else signal.addEventListener('abort', () => reject(new Error('aborted by user')));
      });
      yield init;
      yield assistantMsg;
      await aborted;
    }
    return gen();
  }) as unknown as QueryFn;
}

test('a run in flight has its transcript readable before it finishes', async () => {
  const { db, task } = setUp();
  const assistantMsg = { type: 'assistant', message: { role: 'assistant', content: 'hi' } } as unknown as SDKMessage;
  const { run, done } = runTask(db, task.id, 'manual', hangingAfterAssistant(assistantMsg));

  // Lets the message loop actually reach the assistant message and flush it
  // before this test reads the row back.
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(getRun(db, run.id)?.transcript, [assistantMsg]);
  assert.equal(getRun(db, run.id)?.status, 'running');

  assert.equal(cancelRun(run.id), true);
  await done;
  assert.equal(getRun(db, run.id)?.status, 'cancelled');
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
