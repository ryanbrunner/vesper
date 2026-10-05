import { query as sdkQuery, type Options, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ApiRun, RunTrigger } from '@vesper/shared';
import type { Db } from '../db/client.js';
import { getTaskWithRepo, insertRun, setRunStatus } from '../db/queries.js';
import { decideToolUse } from './permissions.js';
import { runRegistry } from './registry.js';

/** Thrown when the task doesn't exist; the route turns this into a 404. */
export class TaskNotFoundError extends Error {}

/**
 * Thrown when the session's own init message reports a mode other than the
 * one asked for — see the check below for why that is refused rather than
 * carried on.
 */
class AutoModeUnavailable extends Error {}

/**
 * Every run asks for this. Unlike Reeve, Vesper never pins a model, so there
 * is no `fitToModel` step here to trim it away — auto mode is always what is
 * sent, and always what the session is expected to confirm in its own `init`
 * message.
 */
const PERMISSION_MODE = 'auto' as const;

/** The SDK takes an async iterable for its prompt even for a single turn. */
async function* singleMessage(text: string): AsyncIterable<SDKUserMessage> {
  yield { type: 'user', session_id: '', parent_tool_use_id: null, message: { role: 'user', content: text } };
}

export interface RunTaskHandle {
  run: ApiRun;
  /** Resolves once the run's row has reached a terminal status. */
  done: Promise<void>;
}

/** Only so a test can hand this a fake SDK; nothing in production passes a second argument. */
export type QueryFn = typeof sdkQuery;

/**
 * The single server-side entry point for actually running a task. A "Run
 * now" click and the scheduler card both call this and nothing else, so a
 * run started either way is recorded the same way.
 *
 * Inserts the `running` row and returns with it immediately — a run can take
 * minutes, and nothing waits on it. The Claude session then runs in the
 * background, updating the row as it goes and again once it ends.
 *
 * Auth is whatever the SDK's own CLI picks up on its own: the Claude Code
 * login, or `ANTHROPIC_API_KEY` in the environment. The same as Reeve, and
 * nothing here configures either — no `options.env`, which would replace
 * `process.env` rather than add to it and so drop both.
 *
 * Permissions: every run starts in `permissionMode: 'auto'`, `cwd` set to the
 * task's repo — the same classifier Claude Code's own auto mode uses, scoped
 * to that directory. Nothing it escalates is ever approved; see
 * runs/permissions.ts for why. Plainly: Claude can read files, edit them and
 * run commands, all inside the task's repo, exactly where auto mode would let
 * a person's own session do the same unattended. It cannot do anything auto
 * mode itself would stop to ask a person about, because these runs happen
 * with nobody there to ask.
 */
export function runTask(db: Db, taskId: string, trigger: RunTrigger, query: QueryFn = sdkQuery): RunTaskHandle {
  const task = getTaskWithRepo(db, taskId);
  if (!task) throw new TaskNotFoundError(`no task with id ${taskId}`);

  const runId = crypto.randomUUID();
  const run = insertRun(db, { id: runId, taskId, trigger, startedAt: new Date() });

  const abortController = new AbortController();
  // Decided from this, not from the result message: an aborted run has been
  // observed still reporting subtype `success`, the same gotcha Reeve's own
  // runner guards against.
  let cancelled = false;
  runRegistry.register(runId, {
    cancel: () => {
      cancelled = true;
      abortController.abort();
    },
  });

  const options: Omit<Options, 'prompt'> = {
    cwd: task.repo.path,
    abortController,
    sessionId: crypto.randomUUID(),
    permissionMode: PERMISSION_MODE,
    // Nobody is watching to approve anything an auto-mode run escalates, so
    // this answers at once rather than leaving the run parked forever.
    canUseTool: (toolName, input) => Promise.resolve(decideToolUse(toolName, input)),
  };

  // Everything else the SDK emits alongside these (status, progress, hooks,
  // ...) is noise the run detail view has no use for — see schema.ts.
  const transcript: SDKMessage[] = [];

  const done = (async () => {
    let result: Extract<SDKMessage, { type: 'result' }> | null = null;
    try {
      for await (const message of query({ prompt: singleMessage(task.prompt), options })) {
        if (message.type === 'assistant' || message.type === 'user') transcript.push(message);
        if (message.type === 'result') result = message;
        if (message.type === 'system' && message.subtype === 'init' && message.permissionMode !== PERMISSION_MODE) {
          abortController.abort();
          throw new AutoModeUnavailable(
            `Auto mode is unavailable to this session, which started in ${message.permissionMode} mode instead, ` +
              'so the run was stopped before Claude began: check the account Claude Code signs in with.',
          );
        }
      }
    } catch (err) {
      if (err instanceof AutoModeUnavailable) {
        finish(db, runId, 'failed', err.message, result, transcript);
        return;
      }
      if (cancelled) {
        finish(db, runId, 'cancelled', null, result, transcript);
        return;
      }
      finish(db, runId, 'failed', String(err).slice(0, 500), result, transcript);
      return;
    } finally {
      runRegistry.unregister(runId);
    }

    if (cancelled) {
      finish(db, runId, 'cancelled', null, result, transcript);
      return;
    }
    if (!result) {
      finish(db, runId, 'failed', 'stream ended with no result message', null, transcript);
      return;
    }
    if (result.subtype !== 'success') {
      finish(db, runId, 'failed', `run ended: ${result.subtype}`, result, transcript);
      return;
    }
    finish(db, runId, 'succeeded', null, result, transcript);
  })();

  return { run, done };
}

/** Every exit path lands here, so the row's closing fields come from one place. */
function finish(
  db: Db,
  runId: string,
  status: 'succeeded' | 'failed' | 'cancelled',
  errorMessage: string | null,
  result: Extract<SDKMessage, { type: 'result' }> | null,
  transcript: SDKMessage[],
): void {
  setRunStatus(db, runId, {
    status,
    errorMessage,
    finishedAt: new Date(),
    resultText: result && 'result' in result ? result.result : null,
    totalCostUsd: result?.total_cost_usd ?? null,
    usageJson: (result?.usage as Record<string, unknown>) ?? null,
    modelUsageJson: (result?.modelUsage as Record<string, unknown>) ?? null,
    numTurns: result?.num_turns ?? null,
    transcriptJson: transcript,
  });
}

/** Asks the registered run, if there is still one, to stop. True if there was. */
export function cancelRun(runId: string): boolean {
  return runRegistry.cancel(runId);
}
