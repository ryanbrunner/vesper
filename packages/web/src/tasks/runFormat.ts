import type { ApiRun } from '@vesper/shared';

/** A run's status, as the word a person would say. */
export const STATUS_LABEL: Record<ApiRun['status'], string> = {
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
  skipped: 'Skipped',
};

/**
 * A run's status as text colour. The hues are the run-state tokens in
 * index.css, copied from Reeve: sky running, green succeeded, red failed,
 * slate for the two that did not finish by choice. Every map here is a literal
 * object, not built by string replacement: Tailwind only generates a utility
 * for a class it can find written out.
 */
export const STATUS_COLOR: Record<ApiRun['status'], string> = {
  running: 'text-activity-running-mark',
  succeeded: 'text-activity-success-mark',
  failed: 'text-activity-error-mark',
  cancelled: 'text-activity-idle-mark',
  // The scheduler's own outcome: the task's previous run was still going
  // when this one came due. Shows up in run history, never as the latest run
  // (getLatestRun excludes it so it can't hide the in-flight run).
  skipped: 'text-activity-idle-mark',
};

/** The row skin a status wears: glow for the three that matter, plain for the rest. */
export const STATUS_GLOW: Record<ApiRun['status'], string> = {
  running: 'card-glow card-glow-running',
  succeeded: 'card-glow card-glow-success',
  failed: 'card-glow card-glow-error',
  cancelled: 'card-idle',
  skipped: 'card-idle',
};

/** The same skins at modal size, with the bloom onto the scrim. */
export const STATUS_MODAL_GLOW: Record<ApiRun['status'], string> = {
  running: 'card-glow card-glow-running modal-glow-running',
  succeeded: 'card-glow card-glow-success modal-glow-success',
  failed: 'card-glow card-glow-error modal-glow-error',
  cancelled: 'border-edge bg-panel shadow-xl',
  skipped: 'border-edge bg-panel shadow-xl',
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

/** The first `length` characters of `text`, with an ellipsis appended if it was cut short. */
export function truncate(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

/** A run's text on one line: whitespace collapsed, for a row that truncates it with CSS. */
export function oneLine(text: string, max = 400): string {
  return truncate(text.replace(/\s+/g, ' ').trim(), max);
}
