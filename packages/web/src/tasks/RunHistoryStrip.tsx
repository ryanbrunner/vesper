import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { STATUS_COLOR } from './runFormat.js';

/** How many of a task's most recent runs the strip shows, oldest to newest, left to right. */
const STRIP_LENGTH = 10;

/**
 * A compact run-history strip: a task's last few runs as small colored marks
 * by status, the same STATUS_COLOR the history modal and run detail use.
 * Lets a row's recent pattern — steady green, one red blip, a stretch of
 * grey while paused — read at a glance, next to the latest-run line, without
 * opening History. Polls while any run here is still going, the same
 * pattern TaskList's own LatestRun uses.
 */
export function RunHistoryStrip({ taskId }: { taskId: string }) {
  const runs = useQuery({
    queryKey: ['runs', taskId],
    queryFn: () => api.runsForTask(taskId),
    refetchInterval: (query) => (query.state.data?.some((r) => r.status === 'running') ? 2000 : false),
  });

  if (!runs.data?.length) return null;
  // Newest first off the wire; shown oldest-to-newest, left to right.
  const recent = runs.data.slice(0, STRIP_LENGTH).reverse();

  return (
    <div className="flex items-center gap-1">
      {recent.map((run) => (
        <span
          key={run.id}
          title={`${run.trigger} · ${run.status}`}
          className={`h-1.5 w-1.5 rounded-full ${STATUS_COLOR[run.status].replace('text-', 'bg-')}`}
        />
      ))}
    </div>
  );
}
