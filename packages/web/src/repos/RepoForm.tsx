import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiRepo } from '@vesper/shared';
import { api } from '../lib/api.js';

/**
 * Name + path, nothing else — reachable inline from the task form so a repo
 * doesn't need its own page to add one. A `<div>`, not a `<form>`: it's
 * nested inside TaskModal's own form, and a submit event bubbling up from
 * here would save the task before the new repo could be picked.
 */
export function RepoForm({ onCreated }: { onCreated: (repo: ApiRepo) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [path, setPath] = useState('');

  const create = useMutation({
    mutationFn: () => api.createRepo({ name, path }),
    onSuccess: (repo) => {
      qc.invalidateQueries({ queryKey: ['repos'] });
      setName('');
      setPath('');
      onCreated(repo);
    },
  });

  return (
    <div className="flex flex-col gap-2 rounded-md border border-edge bg-panel/60 p-3">
      <p className="font-mono text-xs uppercase tracking-wide text-muted">New repo</p>
      <input
        className="rounded border border-edge bg-ink px-2 py-1 text-sm text-text"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="rounded border border-edge bg-ink px-2 py-1 text-sm text-text"
        placeholder="Absolute path"
        value={path}
        onChange={(e) => setPath(e.target.value)}
      />
      {create.isError && <p className="text-xs text-red-400">{create.error.message}</p>}
      <button
        type="button"
        disabled={create.isPending || !name || !path}
        onClick={() => create.mutate()}
        className="self-start rounded bg-enabled-fill px-3 py-1 text-sm text-text hover:brightness-110 disabled:opacity-50"
      >
        Add repo
      </button>
    </div>
  );
}

/**
 * The repo registry on its own, for adding and removing repos outside of
 * picking one for a task. The only place `api.deleteRepo` is called — the
 * server's own in-use guard is what a repo still assigned to a task runs
 * into, surfaced here as the mutation's error.
 */
export function RepoManager({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const repos = useQuery({ queryKey: ['repos'], queryFn: api.repos });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteRepo(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['repos'] }),
  });

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-lg border border-edge bg-panel p-5 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-text">Repos</h2>

        <ul className="mb-3 flex flex-col gap-2">
          {repos.data?.map((repo) => (
            <li key={repo.id} className="flex items-center justify-between gap-2 rounded border border-edge px-2 py-1">
              <div className="min-w-0">
                <p className="truncate text-sm text-text">{repo.name}</p>
                <p className="truncate font-mono text-xs text-muted">{repo.path}</p>
              </div>
              <button
                className="text-sm text-muted hover:text-red-400"
                onClick={() => remove.mutate(repo.id)}
              >
                Delete
              </button>
            </li>
          ))}
          {repos.data?.length === 0 && <p className="text-sm text-muted">No repos yet.</p>}
        </ul>

        {remove.isError && <p className="mb-3 text-xs text-red-400">{remove.error.message}</p>}

        <RepoForm onCreated={() => {}} />

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="rounded px-3 py-1 text-sm text-muted hover:text-text">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
