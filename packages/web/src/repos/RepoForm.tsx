import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiRepo } from '@vesper/shared';
import { api } from '../lib/api.js';

/** Name + path, nothing else — reachable inline from the task form so a repo doesn't need its own page to add one. */
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
    <form
      className="flex flex-col gap-2 rounded-md border border-edge bg-panel/60 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <p className="font-mono text-xs uppercase tracking-wide text-muted">New repo</p>
      <input
        className="rounded border border-edge bg-ink px-2 py-1 text-sm text-text"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        className="rounded border border-edge bg-ink px-2 py-1 text-sm text-text"
        placeholder="Absolute path"
        value={path}
        onChange={(e) => setPath(e.target.value)}
        required
      />
      {create.isError && <p className="text-xs text-red-400">{create.error.message}</p>}
      <button
        type="submit"
        disabled={create.isPending}
        className="self-start rounded bg-enabled-fill px-3 py-1 text-sm text-text hover:brightness-110"
      >
        Add repo
      </button>
    </form>
  );
}
