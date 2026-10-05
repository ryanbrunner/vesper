/**
 * One execution of a task's prompt: who started it, when, how it ended, and
 * what Claude reported back. A task is run through a single server-side
 * entry point (packages/server/src/runs/claude.ts), and every call of it —
 * a "Run now" click or, later, the scheduler — leaves one of these behind.
 */
export type RunTrigger = 'manual' | 'scheduled';
export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

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
  /** Set on `failed`; left null for every other status. */
  errorMessage: string | null;
}

/**
 * `ApiRun` plus the transcript: the SDK's own `assistant`/`user` messages,
 * in order, as sent over the wire by the run itself. Kept off the list and
 * latest-run shapes — a task's history can be dozens of runs, and nothing
 * there reads a transcript — and attached only to the single-run endpoint
 * the run detail view calls.
 */
export interface ApiRunDetail extends ApiRun {
  transcript: unknown[] | null;
}
