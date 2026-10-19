import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ApiTask } from '@vesper/shared';
import { api } from '../lib/api.js';
import { RunDetail } from './RunDetail.js';
import { formatCost, formatDuration, STATUS_COLOR, STATUS_LABEL } from './runFormat.js';
import { StatusLight } from './StatusLight.js';
import { CloseIcon } from '../ui/Glyph.js';

/**
 * A task's run history, newest first, as a modal over the task list.
 * `RunList`, below, does the actual rendering and polling — this is just its
 * dialog chrome.
 */
export function RunHistory({ task, onClose }: { task: ApiTask; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/60 px-4">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-edge bg-panel p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="truncate text-lg font-semibold tracking-[-0.01em] text-text">{task.name} <span className="font-normal text-muted">· runs</span></h2>
          <button onClick={onClose} className="icon-btn" aria-label="Close" title="Close">
            <CloseIcon />
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
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-panel-hover"
            >
              <StatusLight status={run.status} size={24} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text">{new Date(run.startedAt).toLocaleString()}</p>
                <p className="font-mono text-xs text-muted">{run.trigger}</p>
              </div>
              <div className="tnum flex shrink-0 items-center gap-4 font-mono text-xs text-muted">
                <span>{formatDuration(run)}</span>
                <span className="w-16 text-right">{formatCost(run.totalCostUsd)}</span>
                <span className={`w-20 text-right font-medium ${STATUS_COLOR[run.status]}`}>{STATUS_LABEL[run.status]}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {selectedRunId && <RunDetail runId={selectedRunId} onClose={() => setSelectedRunId(null)} />}
    </>
  );
}
