import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ApiTask } from '@vesper/shared';
import { api } from './lib/api.js';
import { TaskList } from './tasks/TaskList.js';
import { TaskModal } from './tasks/TaskModal.js';

// `?new` opens the create form straight away, per Testing's captures.
const openOnLoad = new URLSearchParams(window.location.search).has('new');

export function App() {
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: api.tasks });
  const [editing, setEditing] = useState<ApiTask | null | undefined>(openOnLoad ? null : undefined);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold text-text">Vesper</h1>
          <span className="font-mono text-xs uppercase tracking-wide text-muted">
            Scheduled tasks {tasks.data?.length ?? 0}
          </span>
        </div>
        <button
          className="rounded bg-enabled-fill px-3 py-1.5 text-sm text-text hover:brightness-110"
          onClick={() => setEditing(null)}
        >
          New task
        </button>
      </header>

      {tasks.isLoading && <p className="text-sm text-muted">Loading…</p>}
      {tasks.isError && <p className="text-sm text-red-400">{tasks.error.message}</p>}
      {tasks.data && <TaskList tasks={tasks.data} onEdit={setEditing} />}

      {editing !== undefined && <TaskModal task={editing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}
