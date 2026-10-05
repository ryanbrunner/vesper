import { lastDueAt } from '@vesper/shared';
import type { Db } from '../db/client.js';
import { getLatestRun, listTasks, recordSkippedRun } from '../db/queries.js';
import { runTask, type QueryFn } from './claude.js';

export interface SchedulerHandle {
  /** Checks every enabled task once, exposed so a test can drive it without waiting on a timer. */
  tick: () => void;
  stop: () => void;
}

const DEFAULT_TICK_MS = 15_000;

/**
 * Runs every enabled task on its own cron schedule, through the same
 * `runTask` entry point "Run now" uses — a scheduled fire leaves exactly the
 * kind of `run` row a manual one does, just with `trigger: 'scheduled'`.
 *
 * A single timer wakes up every `tickMs` and walks the task table fresh each
 * time, rather than one timer per task counting down to its own next fire.
 * That is what makes the following hold without any extra wiring:
 *
 * - **Pausing or editing a task takes effect on the very next tick.** There
 *   is nothing to cancel or reschedule — the next tick simply reads the
 *   task's current `enabled`, `schedule` and `timezone` and acts on those.
 * - **Overlap is never a second run.** If a task's own latest run is still
 *   `running` when its schedule comes due again, this tick records a
 *   `skipped` run instead of calling `runTask` a second time.
 * - **No backlog is ever replayed.** Each task's own high-water mark starts
 *   at the moment this scheduler first sees that task — on boot, or when a
 *   task is first created — rather than at some point in the past. A
 *   schedule that came due while the server was down, or while the task sat
 *   paused, is not run when things come back; there is no "catch-up" run
 *   either, by the same reasoning: these runs edit real repos and spend
 *   real money, and nothing should fire on a schedule nobody was there to
 *   see go by.
 * - **Time zone defaults to the machine's own, unless a task sets its own.**
 *   `lastDueAt` is handed the task's `timezone` verbatim, including null.
 */
export function startScheduler(
  db: Db,
  options: { query?: QueryFn; tickMs?: number; now?: () => Date } = {},
): SchedulerHandle {
  const now = options.now ?? (() => new Date());
  const tickMs = options.tickMs ?? DEFAULT_TICK_MS;
  // Per task, the last instant a tick has already accounted for. Absent
  // entirely for a task this scheduler hasn't seen yet, so its first tick
  // only records "now" as the starting line, rather than treating every
  // moment before it as unrun.
  const checkedThrough = new Map<string, Date>();

  function tick(): void {
    const at = now();
    for (const t of listTasks(db)) {
      const baseline = checkedThrough.get(t.id);
      checkedThrough.set(t.id, at);
      if (!t.enabled || !baseline) continue;

      const due = lastDueAt(t.schedule, at, t.timezone);
      if (due <= baseline) continue;

      const latest = getLatestRun(db, t.id);
      if (latest?.status === 'running') {
        recordSkippedRun(db, {
          id: crypto.randomUUID(),
          taskId: t.id,
          reason: 'skipped: the previous run of this task was still going',
        });
        continue;
      }
      runTask(db, t.id, 'scheduled', options.query);
    }
  }

  // Run once immediately so every task's baseline is set at start-up, not
  // after the first `tickMs` delay — otherwise a schedule crossing a
  // boundary in that window would look like a catch-up run instead of an
  // ordinary one.
  tick();
  const timer = setInterval(tick, tickMs);
  return { tick, stop: () => clearInterval(timer) };
}
