import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { describeCron, type ApiTask } from '@vesper/shared';
import { api } from '../lib/api.js';
import { RunList } from './RunHistory.js';
import { ArrowLeftIcon, BranchIcon, ClockIcon, PauseIcon, PlayIcon } from '../ui/Glyph.js';
import { STATUS_COLOR, STATUS_GLOW, STATUS_LABEL } from './runFormat.js';
import { Rail, StatusLight } from './StatusLight.js';
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

  if (task.isLoading) return <p className="mx-auto max-w-5xl px-4 py-8 sm:px-6 text-sm text-muted">Loading…</p>;
  if (task.isError || !task.data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <p className="text-sm text-red-400">{task.error?.message ?? 'Task not found.'}</p>
        <Link to="/" className="text-sm text-muted hover:text-text">
          ← Back to tasks
        </Link>
      </div>
    );
  }

  const t = task.data;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeftIcon />
        Tasks
      </Link>

      <header className="mt-3 mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-xl font-semibold tracking-[-0.01em] text-text">{t.name}</h1>
        <span className="flex items-center gap-1.5 rounded-full border border-edge px-2 py-0.5 font-mono text-xs text-muted">
          <BranchIcon />
          {t.repoName}
        </span>
        {!t.enabled && (
          <span className="flex items-center gap-1.5 rounded-full border border-edge px-2 py-0.5 font-mono text-xs text-muted">
            <PauseIcon />
            Paused
          </span>
        )}
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
      <div
        className={`relative flex items-center gap-4 rounded-lg border px-4 py-3.5 ${
          latest.data ? STATUS_GLOW[latest.data.status] : 'card-idle'
        }`}
      >
        <StatusLight status={latest.data?.status ?? null} />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs uppercase tracking-wide text-muted">Latest run</p>
          <p className={`font-medium ${latest.data ? STATUS_COLOR[latest.data.status] : 'text-muted'}`}>
            {latest.data ? STATUS_LABEL[latest.data.status] : 'Never run'}
          </p>
        </div>
        {running ? (
          <button
            className="flex h-8 items-center gap-1.5 rounded-md border border-activity-error-border bg-activity-error-fill px-3 text-sm text-activity-error-mark transition-colors hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={stop.isPending}
            onClick={() => latest.data && stop.mutate(latest.data.id)}
          >
            <span className="h-2 w-2 rounded-[2px] bg-current" />
            Stop
          </button>
        ) : (
          <button className="btn-primary" disabled={retry.isPending} onClick={() => retry.mutate()}>
            <PlayIcon />
            {latest.data ? 'Retry' : 'Run now'}
          </button>
        )}
        {running && <Rail />}
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
