import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CanUseTool, Options, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ApiModel } from '@vesper/shared';
import { createRepo, createTask, getLatestRun, getRun } from '../db/queries.js';
import { testDb, testRepoDir } from '../routes/test-helpers.js';
import { RunAlreadyInProgressError, cancelRun, fitToModel, runTask, type QueryFn } from './claude.js';

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

test('runTask rejects a second run while the first is still running, and allows one once it ends', async () => {
  const { db, task } = setUp();
  const { run, done } = runTask(db, task.id, 'manual', hanging());

  assert.throws(() => runTask(db, task.id, 'manual', scripted([])), RunAlreadyInProgressError);

  assert.equal(cancelRun(run.id), true);
  await done;

  assert.doesNotThrow(() => runTask(db, task.id, 'manual', scripted([])));
});

test('a task with no model pinned sends auto mode and no model override, as before', async () => {
  const { db, task } = setUp();
  let seen: { model?: string; effort?: string; permissionMode?: string } = {};
  const capture: QueryFn = ((args: { prompt: unknown; options: Options }) => {
    seen = { model: args.options.model, effort: args.options.effort as string, permissionMode: args.options.permissionMode };
    async function* gen() {
      yield init;
    }
    return gen();
  }) as unknown as QueryFn;

  // Hands fitToModel's lookup a stub that would answer `caps` for any model —
  // proving the "no override" behaviour comes from `task.model` being null,
  // not from the lookup happening to find nothing.
  const { done } = runTask(db, task.id, 'manual', capture, async () => ({
    value: 'opus',
    resolvedModel: null,
    displayName: 'Opus',
    description: '',
    supportsAutoMode: true,
  }));
  await done;

  assert.equal(seen.model, undefined);
  assert.equal(seen.effort, undefined);
  assert.equal(seen.permissionMode, 'auto');
});

test('fitToModel trims an effort level the model does not support', async () => {
  const caps: ApiModel = {
    value: 'haiku',
    resolvedModel: null,
    displayName: 'Haiku',
    description: '',
    supportsEffort: true,
    supportedEffortLevels: ['low', 'medium'],
  };
  const fitted = await fitToModel('haiku', 'high', async () => caps);
  assert.equal(fitted.effort, null);
});

test('fitToModel only keeps auto mode when the model explicitly reports it', async () => {
  const caps: ApiModel = { value: 'haiku', resolvedModel: null, displayName: 'Haiku', description: '' };
  const fitted = await fitToModel('haiku', null, async () => caps);
  assert.equal(fitted.autoMode, false);
});

test('a pinned model and effort are forwarded to the SDK options', async () => {
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

  let seen: { model?: string; effort?: string; permissionMode?: string } = {};
  const capture: QueryFn = ((args: { prompt: unknown; options: Options }) => {
    seen = { model: args.options.model, effort: args.options.effort as string, permissionMode: args.options.permissionMode };
    async function* gen() {
      yield { type: 'system', subtype: 'init', permissionMode: 'auto' } as SDKMessage;
    }
    return gen();
  }) as unknown as QueryFn;

  const caps: ApiModel = {
    value: 'opus',
    resolvedModel: null,
    displayName: 'Opus',
    description: '',
    supportsEffort: true,
    supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    supportsAutoMode: true,
  };

  // The stubbed lookup, not a stubbed fitToModel: this is what proves
  // `runTask` reads task.model/task.effort itself, rather than the stub
  // supplying the values the assertions below check for.
  const { done } = runTask(db, task.id, 'manual', capture, async () => caps);
  await done;

  assert.equal(seen.model, 'opus');
  assert.equal(seen.effort, 'high');
  assert.equal(seen.permissionMode, 'auto');
});

test('a model that does not support auto mode runs without one, and is not treated as a mismatch', async () => {
  const db = testDb();
  const repo = createRepo(db, { name: 'vesper', path: testRepoDir() });
  const task = createTask(db, {
    name: 'nightly',
    prompt: 'do the thing',
    repoId: repo.id,
    schedule: '0 2 * * *',
    model: 'haiku',
  });

  let seen: { permissionMode?: string } = {};
  const capture: QueryFn = ((args: { prompt: unknown; options: Options }) => {
    seen = { permissionMode: args.options.permissionMode };
    async function* gen() {
      // Reports a mode other than 'auto', the same way the real CLI does for
      // a model that never took the request in the first place.
      yield { type: 'system', subtype: 'init', permissionMode: 'default' } as SDKMessage;
      yield { type: 'result', subtype: 'success', result: 'done' } as unknown as SDKMessage;
    }
    return gen();
  }) as unknown as QueryFn;

  const caps: ApiModel = { value: 'haiku', resolvedModel: null, displayName: 'Haiku', description: '' };
  const { done } = runTask(db, task.id, 'manual', capture, async () => caps);
  await done;

  // options.permissionMode was never set, so nothing was sent for the model
  // to reject in the first place.
  assert.equal(seen.permissionMode, undefined);

  const latest = getLatestRun(db, task.id);
  assert.equal(latest?.status, 'succeeded');
});
