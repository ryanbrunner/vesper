import { query as sdkQuery, type Options, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ApiRun, EffortLevel, RunTrigger } from '@vesper/shared';
import type { Db } from '../db/client.js';
import { getTaskWithRepo, insertRun, setRunStatus } from '../db/queries.js';
import { capabilitiesFor } from './models.js';
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
 * The permission mode every run asks for. A task that leaves `model` unset
 * always gets it — `fitToModel(null, effort)` short-circuits to `autoMode:
 * true` below. A pinned model that doesn't support it is left to start in
 * its own default mode instead; see `fitToModel`.
 */
const PERMISSION_MODE = 'auto' as const;

/**
 * Trims what a task asked for to what its pinned model takes, so a setting
 * the model rejects never reaches it. No model (`null`) is the CLI's own
 * default, which takes everything asked of it: that's the path every task
 * followed before tasks could pin a model, and it is unchanged here. A
 * pinned model the CLI did not list is sent through as asked, same as Reeve.
 *
 * `supportsAutoMode` is read the other way around from every other
 * capability: only an explicit `true` keeps `permissionMode: 'auto'` in the
 * request, because a model that never reports it (e.g. Haiku) starts a
 * session in its own default mode instead of honouring the one asked for.
 * Ported near-verbatim from Reeve's packages/server/src/runs/claude.ts.
 */
// Exported, and the lookup injectable, only so a test can hand this a model
// the real CLI capability lookup can't answer for in the test sandbox.
export async function fitToModel(
  model: string | null,
  effort: EffortLevel | null,
  lookup: typeof capabilitiesFor = capabilitiesFor,
): Promise<{ effort: EffortLevel | null; autoMode: boolean }> {
  const caps = model ? await lookup(model) : undefined;
  if (!caps) return { effort, autoMode: true };
  const takesEffort =
    effort !== null && caps.supportsEffort !== false && (caps.supportedEffortLevels?.includes(effort) ?? true);
  return {
    effort: takesEffort ? effort : null,
    autoMode: caps.supportsAutoMode === true,
  };
}

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
    ...(task.model ? { model: task.model } : {}),
    // Nobody is watching to approve anything an auto-mode run escalates, so
    // this answers at once rather than leaving the run parked forever.
    canUseTool: (toolName, input) => Promise.resolve(decideToolUse(toolName, input)),
  };

  const done = (async () => {
    let result: Extract<SDKMessage, { type: 'result' }> | null = null;
    try {
      // Trims the task's own model/effort to what that model actually takes.
      // A task with no model pinned short-circuits to autoMode: true here,
      // exactly as every task behaved before this existed.
      const fitted = await fitToModel(task.model, task.effort);
      if (fitted.effort) options.effort = fitted.effort;
      // A model without auto mode is left to start in its own default mode:
      // options.permissionMode stays unset rather than sending a mode it does
      // not take.
      if (fitted.autoMode) options.permissionMode = PERMISSION_MODE;

      for await (const message of query({ prompt: singleMessage(task.prompt), options })) {
        if (message.type === 'result') result = message;
        if (message.type === 'system' && message.subtype === 'init' && fitted.autoMode && message.permissionMode !== PERMISSION_MODE) {
          abortController.abort();
          const pinned = task.model ? ` for ${task.model}` : '';
          throw new AutoModeUnavailable(
            `Auto mode is unavailable to this session${pinned}, which started in ${message.permissionMode} mode ` +
              'instead, so the run was stopped before Claude began: check the account Claude Code signs in with.',
          );
        }
      }
    } catch (err) {
      if (err instanceof AutoModeUnavailable) {
        finish(db, runId, 'failed', err.message, result);
        return;
      }
      if (cancelled) {
        finish(db, runId, 'cancelled', null, result);
        return;
      }
      finish(db, runId, 'failed', String(err).slice(0, 500), result);
      return;
    } finally {
      runRegistry.unregister(runId);
    }

    if (cancelled) {
      finish(db, runId, 'cancelled', null, result);
      return;
    }
    if (!result) {
      finish(db, runId, 'failed', 'stream ended with no result message', null);
      return;
    }
    if (result.subtype !== 'success') {
      finish(db, runId, 'failed', `run ended: ${result.subtype}`, result);
      return;
    }
    finish(db, runId, 'succeeded', null, result);
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
  });
}

/** Asks the registered run, if there is still one, to stop. True if there was. */
export function cancelRun(runId: string): boolean {
  return runRegistry.cancel(runId);
}
