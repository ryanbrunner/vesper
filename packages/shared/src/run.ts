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

/**
 * How often a task's runs have called tools, tallied server-side from their
 * transcripts rather than shipped as transcripts for the client to count.
 * `name` is either the `<server>` of an MCP tool call (`mcp__<server>__<tool>`)
 * or the literal `'Other'`, which every built-in tool (`Read`, `Bash`, …)
 * buckets under rather than each keeping its own row — there is no per-tool
 * integration to attribute those to yet. No per-call token or cost figure
 * either, since ApiRun only stores those per run.
 */
export interface ApiToolUsage {
  name: string;
  /** Total tool_use blocks counted under this name, across every run considered. */
  callCount: number;
  /** How many of those runs made at least one call under this name. */
  runCount: number;
}
