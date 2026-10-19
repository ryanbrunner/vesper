import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { describeCron, type ApiRun, type ApiTask } from '@vesper/shared';
import { api } from '../lib/api.js';
import { findModel } from '../lib/models.js';
import { BranchIcon, ClockIcon, HistoryIcon, PauseIcon, PencilIcon, PlayIcon, SparkIcon, TrashIcon } from '../ui/Glyph.js';
import { RunHistoryStrip } from './RunHistoryStrip.js';
import { formatCost, formatDuration, oneLine, STATUS_COLOR, STATUS_GLOW, STATUS_LABEL } from './runFormat.js';
import { Rail, StatusLight } from './StatusLight.js';

/** A task's latest run, polled while it is in flight so the row clears on its own once it finishes. */
function useLatestRun(taskId: string) {
  return useQuery({
    queryKey: ['latestRun', taskId],
    queryFn: () => api.latestRun(taskId),
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 2000 : false),
  });
}

/**
 * One row per task. The row itself is lit by its latest run, in the run-state
 * colours: a running task glows sky with a light travelling its bottom edge,
 * a task whose last run failed glows red, one that succeeded glows green. So
 * the page reads as a board of lights before it reads as text. Each row is a
 * status light, the task's name and facts, the latest run's own line, a strip
 * of recent runs, and icon actions: the rest of the width is the run's
 * output, which gets one long truncated line instead of wrapping.
 */
export function TaskList({
  tasks,
  onEdit,
  onHistory,
}: {
  tasks: ApiTask[];
  onEdit: (task: ApiTask) => void;
  onHistory: (task: ApiTask) => void;
}) {
  if (tasks.length === 0) {
    return <p className="py-16 text-center text-sm text-muted">No tasks yet. Create one to get started.</p>;
  }

  return (
    <>
      <Summary tasks={tasks} />
      <ul className="flex flex-col gap-3">
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} onEdit={onEdit} onHistory={onHistory} />
        ))}
      </ul>
    </>
  );
}

/** Tallies of what the board is doing, as lights: the same ones the rows wear. */
function Summary({ tasks }: { tasks: ApiTask[] }) {
  const latest = useQueries({
    queries: tasks.map((t) => ({ queryKey: ['latestRun', t.id], queryFn: () => api.latestRun(t.id) })),
  });
  const statuses = latest.map((q) => q.data?.status);
  const running = statuses.filter((s) => s === 'running').length;
  const failing = statuses.filter((s) => s === 'failed').length;
  const paused = tasks.filter((t) => !t.enabled).length;

  const items = [
    { n: running, label: 'running', dot: 'bg-activity-running-mark shadow-[0_0_8px_var(--color-activity-running-mark)]' },
    { n: failing, label: 'failing', dot: 'bg-activity-error-mark shadow-[0_0_8px_var(--color-activity-error-mark)]' },
    { n: paused, label: 'paused', dot: 'bg-activity-idle-mark opacity-60' },
  ].filter((i) => i.n > 0);

  if (items.length === 0) return null;
  return (
    <div className="mb-3 flex items-center gap-4 font-mono text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${i.dot}`} />
          <span className="tnum text-text">{i.n}</span> {i.label}
        </span>
      ))}
    </div>
  );
}

function TaskRow({
  task,
  onEdit,
  onHistory,
}: {
  task: ApiTask;
  onEdit: (task: ApiTask) => void;
  onHistory: (task: ApiTask) => void;
}) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['tasks'] });
  const models = useQuery({ queryKey: ['models'], queryFn: api.models, staleTime: Infinity });
  const latest = useLatestRun(task.id);
  const run = latest.data ?? null;

  const toggle = useMutation({
    mutationFn: () => (task.enabled ? api.pauseTask(task.id) : api.resumeTask(task.id)),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: () => api.deleteTask(task.id),
    onSuccess: invalidate,
  });

  const modelLabel = [
    task.model && (findModel(models.data?.models ?? [], task.model)?.displayName ?? task.model),
    task.effort,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li
      className={`relative rounded-lg border transition-opacity ${run ? STATUS_GLOW[run.status] : 'card-idle'} ${
        task.enabled ? '' : 'opacity-60 hover:opacity-100'
      }`}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 px-4 py-3.5 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
        <StatusLight status={run?.status ?? null} />

        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <Link to={`/tasks/${task.id}`} className="min-w-0 max-w-full truncate font-medium text-text hover:underline">
              {task.name}
            </Link>
            <Chip icon={<BranchIcon />}>{task.repoName}</Chip>
            {modelLabel && <Chip icon={<SparkIcon />}>{modelLabel}</Chip>}
            {!task.enabled && <Chip icon={<PauseIcon />}>Paused</Chip>}
          </div>

          <p className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted">
            <ClockIcon />
            <span className="truncate">
              {describeCron(task.schedule) ?? task.schedule}
              {task.nextRunTime != null && (
                <>
                  <span className="px-1.5 opacity-50">·</span>next {formatNext(task.nextRunTime)}
                </>
              )}
            </span>
          </p>

        </div>

        <div className="col-span-2 flex items-center justify-between gap-5 lg:col-span-1 lg:justify-end">
          <RunHistoryStrip taskId={task.id} />
          <div className="flex items-center gap-1">
            <RunNowButton task={task} running={run?.status === 'running'} />
            <span className="mx-1 h-4 w-px bg-edge" aria-hidden="true" />
            <button className="icon-btn" title="Run history" aria-label="Run history" onClick={() => onHistory(task)}>
              <HistoryIcon />
            </button>
            <button className="icon-btn" title="Edit task" aria-label="Edit task" onClick={() => onEdit(task)}>
              <PencilIcon />
            </button>
            <button
              className="icon-btn"
              title={task.enabled ? 'Pause schedule' : 'Resume schedule'}
              aria-label={task.enabled ? 'Pause schedule' : 'Resume schedule'}
              disabled={toggle.isPending}
              onClick={() => toggle.mutate()}
            >
              {task.enabled ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              className="icon-btn icon-btn-danger"
              title="Delete task"
              aria-label="Delete task"
              onClick={() => {
                if (confirm(`Delete "${task.name}"?`)) remove.mutate();
              }}
            >
              <TrashIcon />
            </button>
          </div>
        </div>

        {/* Its own full-width line under the facts, so the output has the whole
            row to run along rather than what is left beside the actions. */}
        {run && (
          <div className="col-span-2 min-w-0 border-t border-white/[0.06] pt-2.5 lg:col-span-3">
            <LatestRunLine run={run} />
          </div>
        )}
      </div>
      {run?.status === 'running' && <Rail />}
    </li>
  );
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-edge bg-white/[0.02] px-2 py-0.5 font-mono text-xs text-muted">
      {icon}
      {children}
    </span>
  );
}

/** "Tue, Oct 20, 9:00 AM", short enough to share a line with the cron description. */
function formatNext(time: number): string {
  return new Date(time).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * The latest run on one line: its status and duration, then Claude's closing
 * text or the error, which takes whatever width is left and is cut by CSS
 * rather than at a character count, so a wide window shows more of it.
 */
function LatestRunLine({ run }: { run: ApiRun }) {
  const detail = run.status === 'succeeded' ? run.resultText : run.status === 'failed' ? run.errorMessage : null;
  return (
    <p className="flex min-w-0 items-baseline gap-2 font-mono text-xs">
      <span className={`shrink-0 font-medium ${STATUS_COLOR[run.status]}`}>{STATUS_LABEL[run.status]}</span>
      <span className="tnum shrink-0 text-muted">
        {formatDuration(run)}
        {run.totalCostUsd != null && ` · ${formatCost(run.totalCostUsd)}`}
      </span>
      {detail && (
        <span className="min-w-0 flex-1 truncate text-muted/80" title={detail}>
          {oneLine(detail)}
        </span>
      )}
    </p>
  );
}

function RunNowButton({ task, running }: { task: ApiTask; running: boolean }) {
  const qc = useQueryClient();

  const run = useMutation({
    mutationFn: () => api.runTask(task.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['latestRun', task.id] });
      qc.invalidateQueries({ queryKey: ['runs', task.id] });
    },
  });

  const busy = running || run.isPending;
  return (
    <button
      className={`flex h-8 items-center gap-1.5 rounded-md border border-edge bg-white/[0.03] px-3 text-sm text-text transition-colors hover:border-slate-500 hover:bg-white/[0.07] disabled:cursor-not-allowed ${
        busy ? 'btn-busy border-activity-running-border text-activity-running-mark' : ''
      }`}
      disabled={busy}
      onClick={() => run.mutate()}
    >
      <PlayIcon />
      {busy ? 'Running' : 'Run'}
    </button>
  );
}
