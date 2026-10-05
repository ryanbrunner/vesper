/**
 * One execution of a task's prompt: who started it, when, how it ended, and
 * what Claude reported back. A task is run through a single server-side
 * entry point (packages/server/src/runs/claude.ts), and every call of it —
 * a "Run now" click or the scheduler — leaves one of these behind.
 */
export type RunTrigger = 'manual' | 'scheduled';
/**
 * `skipped` is the scheduler's own outcome, never `runTask`'s: it never
 * reaches `runTask` at all, because the task's previous run was still
 * `running` when this one came due.
 */
export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled' | 'skipped';

export interface ApiRun {
  id: string;
  taskId: string;
  trigger: RunTrigger;
  status: RunStatus;
  startedAt: number;
  finishedAt: number | null;
  /** Claude's own closing text, once the run gets that far. */
  resultText: string | null;
  totalCostUsd: number | null;
  /**
   * The SDK result message's own `usage` object, passed through as-is.
   * Main-agent-loop tokens only — prefer `modelUsage` for accounting, since
   * it also counts subagents; this is kept for whatever reads the loop's own
   * turn-by-turn numbers.
   */
  usage: unknown | null;
  /** The SDK's own `modelUsage`: per-model totals, subagents included. */
  modelUsage: unknown | null;
  numTurns: number | null;
  /** Set on `failed` and `skipped`; left null for every other status. */
  errorMessage: string | null;
}
