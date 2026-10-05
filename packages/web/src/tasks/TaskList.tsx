import { useMutation, useQueryClient } from '@tanstack/react-query';
import { describeCron, type ApiTask } from '@vesper/shared';
import { api } from '../lib/api.js';

/**
 * One row per task, in the mockup's resting-state shape: name, schedule as
 * plain language, a repo pill, an enabled/paused badge, and actions. No
 * run-history strip, tool pills or tokens — nothing here runs yet.
 */
export function TaskList({ tasks, onEdit }: { tasks: ApiTask[]; onEdit: (task: ApiTask) => void }) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['tasks'] });

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
          className={`flex items-center justify-between gap-4 rounded-md border-l-4 bg-panel px-4 py-3 ${
            task.enabled ? 'border-l-enabled-mark' : 'border-l-paused-mark'
          }`}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-text">{task.name}</span>
              <span className="rounded-full border border-edge px-2 py-0.5 font-mono text-xs text-muted">
                {task.repoName}
              </span>
            </div>
            <p className="font-mono text-xs text-muted">{describeCron(task.schedule) ?? task.schedule}</p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-xs uppercase tracking-wide ${
                task.enabled ? 'bg-enabled-fill text-enabled-mark' : 'bg-paused-fill text-paused-mark'
              }`}
            >
              {task.enabled ? 'Enabled' : 'Paused'}
            </span>
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
