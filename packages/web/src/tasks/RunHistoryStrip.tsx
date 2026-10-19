import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { STATUS_LABEL } from './runFormat.js';

/** How many of a task's most recent runs the strip shows, oldest to newest, left to right. */
const STRIP_LENGTH = 12;

/**
 * A task's last runs as a row of lit ticks, newest on the right: steady green,
 * one red blip, a stub of slate for a cancelled or skipped run. The recent
 * pattern reads at a glance, without opening History. Polls while any run here
 * is still going, the same pattern TaskList's own LatestRun uses.
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
    <div className="flex h-4 items-center gap-[3px]" aria-label="Recent runs">
      {recent.map((run) => (
        <span
          key={run.id}
          title={`${STATUS_LABEL[run.status]} · ${run.trigger} · ${new Date(run.startedAt).toLocaleString()}`}
          className={`tick tick-${run.status}`}
        />
      ))}
    </div>
  );
}
