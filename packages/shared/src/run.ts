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
  /** The SDK result message's own `usage` object, passed through as-is. */
  usage: unknown | null;
  numTurns: number | null;
  /** Set on `failed`; left null for every other status. */
  errorMessage: string | null;
}
