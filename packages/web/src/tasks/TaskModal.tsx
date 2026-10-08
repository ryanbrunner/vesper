import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  describeCron,
  isValidCron,
  isValidTimeZone,
  type ApiTask,
  type EffortLevel,
  type TaskModel,
} from '@vesper/shared';
import { api } from '../lib/api.js';
import { effortLevelsFor, keepEffort, mcpServerOptions, modelOptions } from '../lib/models.js';
import { RepoForm } from '../repos/RepoForm.js';

/** Create when `task` is null, edit when it's a task. Same fields either way. */
export function TaskModal({ task, onClose }: { task: ApiTask | null; onClose: () => void }) {
  const qc = useQueryClient();
  const repos = useQuery({ queryKey: ['repos'], queryFn: api.repos });
  const models = useQuery({ queryKey: ['models'], queryFn: api.models, staleTime: Infinity });

  const [name, setName] = useState(task?.name ?? '');
  const [prompt, setPrompt] = useState(task?.prompt ?? '');
  const [repoId, setRepoId] = useState(task?.repoId ?? '');
  const [schedule, setSchedule] = useState(task?.schedule ?? '');
  const [timezone, setTimezone] = useState(task?.timezone ?? '');
  const [model, setModel] = useState(task?.model ?? '');
  const [effort, setEffort] = useState(task?.effort ?? '');
  const [allowedMcpServers, setAllowedMcpServers] = useState<string[] | null>(task?.allowedMcpServers ?? null);
  const [addingRepo, setAddingRepo] = useState(false);

  const repoMcpServers = useQuery({
    queryKey: ['repoMcpServers', repoId],
    queryFn: () => api.repoMcpServers(repoId),
    enabled: !!repoId,
  });
  const mcpOptions = mcpServerOptions(repoMcpServers.data?.servers ?? [], allowedMcpServers);

  const toggleMcpServer = (name: string) => {
    setAllowedMcpServers((prev) => {
      const current = prev ?? [];
      const next = current.includes(name) ? current.filter((n) => n !== name) : [...current, name];
      // Both null and [] mean "pre-approve nothing" today, but a fresh task
      // with everything unchecked should keep sending null — the "never
      // configured" state — not an explicit empty array.
      return next.length === 0 ? null : next;
    });
  };

  const scheduleValid = schedule.length === 0 || isValidCron(schedule);
  const timezoneValid = timezone.length === 0 || isValidTimeZone(timezone);
  const preview = describeCron(schedule);
  const modelList = models.data?.models ?? [];
  const effortLevels = effortLevelsFor(modelList, model || null);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name,
        prompt,
        repoId,
        schedule,
        timezone,
        model: (model || null) as TaskModel | null,
        effort: (effort || null) as EffortLevel | null,
        allowedMcpServers,
      };
      return task ? api.updateTask(task.id, body) : api.createTask(body);
    },
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

          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-wide text-muted">Time zone</span>
            <input
              className="rounded border border-edge bg-ink px-2 py-1 font-mono text-sm text-text"
              placeholder="Machine's local time zone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
            {!timezoneValid && <p className="text-xs text-red-400">Not a recognised time zone.</p>}
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-wide text-muted">Model</span>
            <select
              className="rounded border border-edge bg-ink px-2 py-1 text-sm text-text"
              value={model}
              onChange={(e) => {
                const next = e.target.value;
                setModel(next);
                setEffort(keepEffort(modelList, next || null, (effort || null) as EffortLevel | null) ?? '');
              }}
            >
              <option value="">Default</option>
              {modelOptions(modelList).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-wide text-muted">Effort</span>
            <select
              className="rounded border border-edge bg-ink px-2 py-1 text-sm text-text disabled:opacity-50"
              value={effort}
              onChange={(e) => setEffort(e.target.value)}
              disabled={effortLevels.length === 0}
            >
              <option value="">{effortLevels.length === 0 ? 'No effort on this model' : 'Default'}</option>
              {effortLevels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-wide text-muted">Pre-approved MCP servers</span>
            <p className="text-xs text-muted">
              Checked servers run every tool call unattended, without asking — not just read access, so pick only servers this task
              should act through on its own.
            </p>
            {!repoId && <p className="text-xs text-muted">Choose a repo to see its MCP servers.</p>}
            {repoId && repoMcpServers.isLoading && <p className="text-xs text-muted">Looking for this repo's MCP servers…</p>}
            {repoId && !repoMcpServers.isLoading && mcpOptions.length === 0 && (
              <p className="text-xs text-muted">No MCP servers found for this repo.</p>
            )}
            {mcpOptions.map((o) => (
              <label key={o.name} className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={(allowedMcpServers ?? []).includes(o.name)}
                  onChange={() => toggleMcpServer(o.name)}
                />
                <span>{o.label}</span>
                {o.status && o.status !== 'connected' && <span className="text-xs text-muted">({o.status})</span>}
              </label>
            ))}
          </div>

          {save.isError && <p className="text-xs text-red-400">{save.error.message}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded px-3 py-1 text-sm text-muted hover:text-text">
              Cancel
            </button>
            <button
              type="submit"
              disabled={save.isPending || !scheduleValid || !timezoneValid || !repoId}
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
