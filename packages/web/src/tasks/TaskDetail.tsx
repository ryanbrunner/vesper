import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { describeCron, type ApiTask } from '@vesper/shared';
import { api } from '../lib/api.js';
import { RunList } from './RunHistory.js';
import { STATUS_COLOR } from './runFormat.js';
import { ToolUsagePanel } from './ToolUsagePanel.js';

const TABS = ['runs', 'tools', 'schedule'] as const;
type Tab = (typeof TABS)[number];

function isTab(value: string | undefined): value is Tab {
  return TABS.includes(value as Tab);
}

/**
 * A single task's own page: Runs, Tools and Schedule, each a tab under
 * `/tasks/:id`. `tab` is the last path segment, defaulting to `runs` when
 * it's missing or not one of TABS — a bad or stale tab in the URL falls
 * back rather than rendering nothing.
 */
export function TaskDetail() {
  const { id = '', tab } = useParams<{ id: string; tab?: string }>();
  const activeTab: Tab = isTab(tab) ? tab : 'runs';

  const task = useQuery({ queryKey: ['task', id], queryFn: () => api.task(id) });

  if (task.isLoading) return <p className="mx-auto max-w-3xl px-4 py-8 text-sm text-muted">Loading…</p>;
  if (task.isError || !task.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm text-red-400">{task.error?.message ?? 'Task not found.'}</p>
        <Link to="/" className="text-sm text-muted hover:text-text">
          ← Back to tasks
        </Link>
      </div>
    );
  }

  const t = task.data;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/" className="text-sm text-muted hover:text-text">
        ← Tasks
      </Link>

      <header className="mt-2 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-text">{t.name}</h1>
        <span className="rounded-full border border-edge px-2 py-0.5 font-mono text-xs text-muted">{t.repoName}</span>
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-xs uppercase tracking-wide ${
            t.enabled ? 'bg-enabled-fill text-enabled-mark' : 'bg-paused-fill text-paused-mark'
          }`}
        >
          {t.enabled ? 'Enabled' : 'Paused'}
        </span>
      </header>

      <nav className="mb-5 flex gap-4 border-b border-edge">
        {TABS.map((tabName) => (
          <Link
            key={tabName}
            to={tabName === 'runs' ? `/tasks/${id}` : `/tasks/${id}/${tabName}`}
            className={`-mb-px border-b-2 px-1 pb-2 text-sm capitalize ${
              activeTab === tabName ? 'border-text text-text' : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {tabName}
          </Link>
        ))}
      </nav>

      {activeTab === 'runs' && <RunsTab taskId={id} />}
      {activeTab === 'tools' && <ToolUsagePanel taskId={id} />}
      {activeTab === 'schedule' && <ScheduleTab task={t} />}
    </div>
  );
}

/** The latest run's own status plus Retry/Stop, above the full run list. */
function RunsTab({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const latest = useQuery({
    queryKey: ['latestRun', taskId],
    queryFn: () => api.latestRun(taskId),
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 2000 : false),
  });

  const invalidateRuns = () => {
    qc.invalidateQueries({ queryKey: ['latestRun', taskId] });
    qc.invalidateQueries({ queryKey: ['runs', taskId] });
  };

  const retry = useMutation({ mutationFn: () => api.runTask(taskId), onSuccess: invalidateRuns });
  const stop = useMutation({
    mutationFn: (runId: string) => api.cancelRun(runId),
    onSuccess: invalidateRuns,
  });

  const running = latest.data?.status === 'running';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {latest.data && (
          <span className={`font-mono text-xs uppercase tracking-wide ${STATUS_COLOR[latest.data.status]}`}>
            Latest: {latest.data.status}
          </span>
        )}
        {running ? (
          <button
            className="text-sm text-muted hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={stop.isPending}
            onClick={() => latest.data && stop.mutate(latest.data.id)}
          >
            Stop
          </button>
        ) : (
          <button
            className="text-sm text-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
            disabled={retry.isPending}
            onClick={() => retry.mutate()}
          >
            Retry
          </button>
        )}
      </div>
      <RunList taskId={taskId} />
    </div>
  );
}

/** The task's schedule in plain language, its raw cron expression, and the time zone it runs in. */
function ScheduleTab({ task }: { task: ApiTask }) {
  const description = describeCron(task.schedule);
  return (
    <div className="flex flex-col gap-3">
      {description && <p className="text-sm text-text">{description}</p>}
      <p className="font-mono text-xs text-muted">{task.schedule}</p>
      <p className="text-sm text-muted">{task.timezone ?? "Machine's local time zone"}</p>
    </div>
  );
}
