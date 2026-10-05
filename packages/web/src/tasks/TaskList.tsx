import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeCron, type ApiRun, type ApiTask } from '@vesper/shared';
import { api } from '../lib/api.js';
import { findModel } from '../lib/models.js';

/**
 * One row per task, in the mockup's resting-state shape: name, schedule as
 * plain language, a repo pill, an enabled/paused badge, and actions. Below
 * that, at most the latest run's own status — a full history, with its
 * transcript and tokens, is the run dashboard card's job, not this one's.
 */
export function TaskList({ tasks, onEdit }: { tasks: ApiTask[]; onEdit: (task: ApiTask) => void }) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['tasks'] });
  const models = useQuery({ queryKey: ['models'], queryFn: api.models, staleTime: Infinity });

  const toggle = useMutation({
    mutationFn: (task: ApiTask) => (task.enabled ? api.pauseTask(task.id) : api.resumeTask(task.id)),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (task: ApiTask) => api.deleteTask(task.id),
    onSuccess: invalidate,
  });

  if (tasks.length === 0) {
    return <p className="py-12 text-center text-sm text-muted">No tasks yet. Create one to get started.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {tasks.map((task) => (
        <li
          key={task.id}
          className={`flex flex-col gap-3 rounded-md border-l-4 bg-panel px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
            task.enabled ? 'border-l-enabled-mark' : 'border-l-paused-mark'
          }`}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-text">{task.name}</span>
              <span className="rounded-full border border-edge px-2 py-0.5 font-mono text-xs text-muted">
                {task.repoName}
              </span>
              {(task.model || task.effort) && (
                <span className="rounded-full border border-edge px-2 py-0.5 font-mono text-xs text-muted">
                  {[task.model && (findModel(models.data?.models ?? [], task.model)?.displayName ?? task.model), task.effort]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </div>
            <p className="font-mono text-xs text-muted">{describeCron(task.schedule) ?? task.schedule}</p>
            <LatestRun taskId={task.id} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-xs uppercase tracking-wide ${
                task.enabled ? 'bg-enabled-fill text-enabled-mark' : 'bg-paused-fill text-paused-mark'
              }`}
            >
              {task.enabled ? 'Enabled' : 'Paused'}
            </span>
            <RunNowButton task={task} />
            <button className="text-sm text-muted hover:text-text" onClick={() => onEdit(task)}>
              Edit
            </button>
            <button className="text-sm text-muted hover:text-text" onClick={() => toggle.mutate(task)}>
              {task.enabled ? 'Pause' : 'Resume'}
            </button>
            <button
              className="text-sm text-muted hover:text-red-400"
              onClick={() => {
                if (confirm(`Delete "${task.name}"?`)) remove.mutate(task);
              }}
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

const STATUS_COLOR: Record<ApiRun['status'], string> = {
  running: 'text-sky-400',
  succeeded: 'text-enabled-mark',
  failed: 'text-red-400',
  cancelled: 'text-muted',
};

/** Polled while a run is in flight, so the badge clears on its own once one finishes. */
function LatestRun({ taskId }: { taskId: string }) {
  const latest = useQuery({
    queryKey: ['latestRun', taskId],
    queryFn: () => api.latestRun(taskId),
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 2000 : false),
  });
  if (!latest.data) return null;
  return <p className={`font-mono text-xs ${STATUS_COLOR[latest.data.status]}`}>{latest.data.status}</p>;
}

function RunNowButton({ task }: { task: ApiTask }) {
  const qc = useQueryClient();
  const latest = useQuery({ queryKey: ['latestRun', task.id], queryFn: () => api.latestRun(task.id) });
  const running = latest.data?.status === 'running';

  const run = useMutation({
    mutationFn: () => api.runTask(task.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['latestRun', task.id] }),
  });

  return (
    <button
      className="text-sm text-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
      disabled={running || run.isPending}
      onClick={() => run.mutate()}
    >
      {running ? 'Running…' : 'Run now'}
    </button>
  );
}
