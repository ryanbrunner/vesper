import type { ApiRepo, ApiRun, ApiRunDetail, ApiTask, CreateRepoBody, CreateTaskBody, UpdateTaskBody } from '@vesper/shared';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    // `detail` is where the server puts the sentence worth reading — which
    // path doesn't exist, which cron expression didn't parse.
    const message = body.detail ? `${body.error}: ${body.detail}` : body.error;
    throw new Error(message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const patch = (url: string, body: unknown) =>
  fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const del = (url: string) => fetch(url, { method: 'DELETE' });

export const api = {
  // --- repos ---
  repos: () => fetch('/api/repos').then(json<ApiRepo[]>),
  createRepo: (body: CreateRepoBody) => post('/api/repos', body).then(json<ApiRepo>),
  deleteRepo: (id: string) => del(`/api/repos/${id}`).then(json<{ ok: true }>),

  // --- tasks ---
  tasks: () => fetch('/api/tasks').then(json<ApiTask[]>),
  createTask: (body: CreateTaskBody) => post('/api/tasks', body).then(json<ApiTask>),
  updateTask: (id: string, body: UpdateTaskBody) => patch(`/api/tasks/${id}`, body).then(json<ApiTask>),
  pauseTask: (id: string) => post(`/api/tasks/${id}/pause`, {}).then(json<ApiTask>),
  resumeTask: (id: string) => post(`/api/tasks/${id}/resume`, {}).then(json<ApiTask>),
  deleteTask: (id: string) => del(`/api/tasks/${id}`).then(json<{ ok: true }>),
  runTask: (id: string) => post(`/api/tasks/${id}/run`, {}).then(json<ApiRun>),
  latestRun: (id: string) => fetch(`/api/tasks/${id}/latest-run`).then(json<ApiRun | null>),
  runsForTask: (id: string) => fetch(`/api/tasks/${id}/runs`).then(json<ApiRun[]>),

  // --- runs ---
  run: (id: string) => fetch(`/api/runs/${id}`).then(json<ApiRunDetail>),
};
