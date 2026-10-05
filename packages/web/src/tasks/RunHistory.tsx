import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ApiTask } from '@vesper/shared';
import { api } from '../lib/api.js';
import { RunDetail } from './RunDetail.js';
import { formatCost, formatDuration, STATUS_COLOR } from './runFormat.js';

/**
 * A task's run history, newest first, as a modal over the task list.
 * `RunList`, below, does the actual rendering and polling — this is just its
 * dialog chrome.
 */
export function RunHistory({ task, onClose }: { task: ApiTask; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/60 px-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-edge bg-panel p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">{task.name} — runs</h2>
          <button onClick={onClose} className="text-sm text-muted hover:text-text">
            Close
          </button>
        </div>
        <RunList taskId={task.id} />
      </div>
    </div>
  );
}

/**
 * A task's runs, newest first: trigger, status, start time, duration and
 * cost per run. Opening a row drills into RunDetail for its output, error
 * and transcript. Polls while any run here is still going, the same pattern
 * TaskList's own LatestRun uses, so a run in progress updates on its own
 * rather than needing a reload. Shared by the modal above and the task
 * detail view's Runs tab — the list itself is identical either way, only the
 * chrome around it differs.
 */
export function RunList({ taskId }: { taskId: string }) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const runs = useQuery({
    queryKey: ['runs', taskId],
    queryFn: () => api.runsForTask(taskId),
    refetchInterval: (query) => (query.state.data?.some((r) => r.status === 'running') ? 2000 : false),
  });

  return (
    <>
      {runs.isLoading && <p className="text-sm text-muted">Loading…</p>}
      {runs.data?.length === 0 && <p className="text-sm text-muted">No runs yet.</p>}

      <ul className="flex flex-col gap-1 overflow-y-auto">
        {runs.data?.map((run) => (
          <li key={run.id}>
            <button
              onClick={() => setSelectedRunId(run.id)}
              className="flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left hover:bg-panel-hover"
            >
              <div className="min-w-0">
                <p className="font-mono text-xs uppercase tracking-wide text-muted">{run.trigger}</p>
                <p className="truncate text-sm text-text">{new Date(run.startedAt).toLocaleString()}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-xs text-muted">{formatDuration(run)}</span>
                <span className="font-mono text-xs text-muted">{formatCost(run.totalCostUsd)}</span>
                <span className={`font-mono text-xs uppercase tracking-wide ${STATUS_COLOR[run.status]}`}>
                  {run.status}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {selectedRunId && <RunDetail runId={selectedRunId} onClose={() => setSelectedRunId(null)} />}
    </>
  );
}
