import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeCron, isValidCron, type ApiTask } from '@vesper/shared';
import { api } from '../lib/api.js';
import { RepoForm } from '../repos/RepoForm.js';

/** Create when `task` is null, edit when it's a task. Same fields either way. */
export function TaskModal({ task, onClose }: { task: ApiTask | null; onClose: () => void }) {
  const qc = useQueryClient();
  const repos = useQuery({ queryKey: ['repos'], queryFn: api.repos });

  const [name, setName] = useState(task?.name ?? '');
  const [prompt, setPrompt] = useState(task?.prompt ?? '');
  const [repoId, setRepoId] = useState(task?.repoId ?? '');
  const [schedule, setSchedule] = useState(task?.schedule ?? '');
  const [addingRepo, setAddingRepo] = useState(false);

  const scheduleValid = schedule.length === 0 || isValidCron(schedule);
  const preview = describeCron(schedule);

  const save = useMutation({
    mutationFn: () =>
      task
        ? api.updateTask(task.id, { name, prompt, repoId, schedule })
        : api.createTask({ name, prompt, repoId, schedule }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-lg border border-edge bg-panel p-5 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-text">{task ? 'Edit task' : 'New task'}</h2>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-wide text-muted">Name</span>
            <input
              className="rounded border border-edge bg-ink px-2 py-1 text-sm text-text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-wide text-muted">Prompt</span>
            <textarea
              className="h-24 rounded border border-edge bg-ink px-2 py-1 text-sm text-text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-wide text-muted">Repo</span>
            <select
              className="rounded border border-edge bg-ink px-2 py-1 text-sm text-text"
              value={repoId}
              onChange={(e) => setRepoId(e.target.value)}
              required
            >
              <option value="" disabled>
                Choose a repo
              </option>
              {repos.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="self-start text-xs text-muted underline hover:text-text"
              onClick={() => setAddingRepo((v) => !v)}
            >
              {addingRepo ? 'Cancel' : "Don't see it? Add a repo"}
            </button>
            {addingRepo && (
              <RepoForm
                onCreated={(r) => {
                  setRepoId(r.id);
                  setAddingRepo(false);
                }}
              />
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-wide text-muted">Schedule (cron)</span>
            <input
              className="rounded border border-edge bg-ink px-2 py-1 font-mono text-sm text-text"
              placeholder="0 9 * * 1-5"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              required
            />
            {!scheduleValid && <p className="text-xs text-red-400">Not a valid cron expression.</p>}
            {preview && <p className="font-mono text-xs text-muted">{preview}</p>}
          </label>

          {save.isError && <p className="text-xs text-red-400">{save.error.message}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded px-3 py-1 text-sm text-muted hover:text-text">
              Cancel
            </button>
            <button
              type="submit"
              disabled={save.isPending || !scheduleValid || !repoId}
              className="rounded bg-enabled-fill px-3 py-1 text-sm text-text hover:brightness-110 disabled:opacity-50"
            >
              {task ? 'Save' : 'Create task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
