import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ApiTask } from '@vesper/shared';
import { api } from './lib/api.js';
import { RepoManager } from './repos/RepoForm.js';
import { RunDetail } from './tasks/RunDetail.js';
import { RunHistory } from './tasks/RunHistory.js';
import { TaskList } from './tasks/TaskList.js';
import { TaskModal } from './tasks/TaskModal.js';

// `?new` opens the create form straight away, per Testing's captures.
const openOnLoad = new URLSearchParams(window.location.search).has('new');
// `?run=<id>` opens that run's detail view directly, same reason: a capturable URL that
// doesn't need navigating to through RunHistory first.
const runIdOnLoad = new URLSearchParams(window.location.search).get('run');

export function App() {
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: api.tasks });
  const [editing, setEditing] = useState<ApiTask | null | undefined>(openOnLoad ? null : undefined);
  const [managingRepos, setManagingRepos] = useState(false);
  const [historyTask, setHistoryTask] = useState<ApiTask | null>(null);
  const [openRunId, setOpenRunId] = useState<string | null>(runIdOnLoad);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold text-text">Vesper</h1>
          <span className="font-mono text-xs uppercase tracking-wide text-muted">
            Scheduled tasks {tasks.data?.length ?? 0}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-sm text-muted hover:text-text" onClick={() => setManagingRepos(true)}>
            Repos
          </button>
          <button
            className="rounded bg-enabled-fill px-3 py-1.5 text-sm text-text hover:brightness-110"
            onClick={() => setEditing(null)}
          >
            New task
          </button>
        </div>
      </header>

      {tasks.isLoading && <p className="text-sm text-muted">Loading…</p>}
      {tasks.isError && <p className="text-sm text-red-400">{tasks.error.message}</p>}
      {tasks.data && <TaskList tasks={tasks.data} onEdit={setEditing} onHistory={setHistoryTask} />}

      {editing !== undefined && <TaskModal task={editing} onClose={() => setEditing(undefined)} />}
      {managingRepos && <RepoManager onClose={() => setManagingRepos(false)} />}
      {historyTask && <RunHistory task={historyTask} onClose={() => setHistoryTask(null)} />}
      {openRunId && <RunDetail runId={openRunId} onClose={() => setOpenRunId(null)} />}
    </div>
  );
}
