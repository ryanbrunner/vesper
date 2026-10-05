import type { ApiRun } from '@vesper/shared';

/** A run's status, read straight off Tailwind's own palette — see index.css. */
export const STATUS_COLOR: Record<ApiRun['status'], string> = {
  running: 'text-sky-400',
  succeeded: 'text-enabled-mark',
  failed: 'text-red-400',
  cancelled: 'text-muted',
  // The scheduler's own outcome: the task's previous run was still going
  // when this one came due. Shows up in run history, never as the latest run
  // (getLatestRun excludes it so it can't hide the in-flight run).
  skipped: 'text-muted',
};

/**
 * Wall-clock duration, as a short "1m 04s"/"12s" string. For a run still
 * going, measured against `now` rather than `finishedAt` — the caller is
 * expected to re-render on an interval if it wants this to tick.
 */
export function formatDuration(run: Pick<ApiRun, 'startedAt' | 'finishedAt'>): string {
  const end = run.finishedAt ?? Date.now();
  const totalSeconds = Math.max(0, Math.round((end - run.startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`;
}

/** "—" for a run that never reported a cost, e.g. one still running or one that failed before Claude billed anything. */
export function formatCost(totalCostUsd: number | null): string {
  return totalCostUsd == null ? '—' : `$${totalCostUsd.toFixed(totalCostUsd < 1 ? 4 : 2)}`;
}

/** A token count as a short "1.2k"/"834" string, for the tool-usage panel's token column. */
export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
