import { statSync } from 'node:fs';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import {
  isValidCron,
  isValidTimeZone,
  nextRunAt,
  type ApiRepo,
  type ApiRun,
  type ApiRunDetail,
  type ApiTask,
  type ApiToolUsage,
  type CreateTaskBody,
  type RunStatus,
  type RunTrigger,
  type UpdateTaskBody,
} from '@vesper/shared';
import type { Db } from './client.js';
import { repo, run, task } from './schema.js';

/** Thrown for anything a 400 should report back with a readable `detail`. */
export class ValidationError extends Error {}

/** Thrown when a repo cannot be deleted because a task still references it. */
export class RepoInUseError extends Error {}

const repoColumns = { id: repo.id, name: repo.name, path: repo.path };

export function listRepos(db: Db): ApiRepo[] {
  return db.select(repoColumns).from(repo).orderBy(asc(repo.name)).all();
}

export function getRepo(db: Db, id: string): ApiRepo | undefined {
  return db.select(repoColumns).from(repo).where(eq(repo.id, id)).get();
}

/**
 * Checked against the filesystem here, rather than left to a foreign-key-style
 * constraint SQLite has no way to express: a repo pointed at a directory that
 * doesn't exist would be silently useless until a task tried to run in it.
 */
export function createRepo(db: Db, values: { name: string; path: string }): ApiRepo {
  let stat;
  try {
    stat = statSync(values.path);
  } catch {
    throw new ValidationError(`${values.path} does not exist`);
  }
  if (!stat.isDirectory()) {
    throw new ValidationError(`${values.path} is not a directory`);
  }
  return db
    .insert(repo)
    .values({ ...values, id: crypto.randomUUID() })
    .returning(repoColumns)
    .get();
}

/**
 * The DB's own `onDelete: 'restrict'` would refuse this anyway, but only with
 * a raw SQLite constraint message. Checked here first so the route can give a
 * sentence a person can read instead.
 */
export function deleteRepo(db: Db, id: string): void {
  const inUse = db.select().from(task).where(eq(task.repoId, id)).get();
  if (inUse) {
    throw new RepoInUseError(`"${inUse.name}" still uses this repo`);
  }
  db.delete(repo).where(eq(repo.id, id)).run();
}

const taskColumns = {
  id: task.id,
  name: task.name,
  prompt: task.prompt,
  repoId: task.repoId,
  repoName: repo.name,
  schedule: task.schedule,
  timezone: task.timezone,
  model: task.model,
  effort: task.effort,
  allowedMcpServers: task.allowedMcpServers,
  enabled: task.enabled,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
};

function toApiTask(
  row: { createdAt: Date; updatedAt: Date } & Omit<ApiTask, 'createdAt' | 'updatedAt' | 'nextRunTime'>,
): ApiTask {
  return {
    ...row,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    nextRunTime: nextRunAt(row.schedule, new Date(), row.timezone)?.getTime() ?? null,
  };
}

export function listTasks(db: Db): ApiTask[] {
  return db
    .select(taskColumns)
    .from(task)
    .innerJoin(repo, eq(task.repoId, repo.id))
    .orderBy(desc(task.createdAt))
    .all()
    .map(toApiTask);
}

/** The row a mutation route returns, with the repo name the wire type needs. */
export function getApiTask(db: Db, id: string): ApiTask | undefined {
  const row = db.select(taskColumns).from(task).innerJoin(repo, eq(task.repoId, repo.id)).where(eq(task.id, id)).get();
  return row ? toApiTask(row) : undefined;
}

export function getTask(db: Db, id: string) {
  return db.select().from(task).where(eq(task.id, id)).get();
}

function assertValidTask(db: Db, { repoId, schedule, timezone }: { repoId: string; schedule: string; timezone: string | null }) {
  if (!isValidCron(schedule)) {
    throw new ValidationError(`"${schedule}" is not a valid cron expression`);
  }
  if (timezone !== null && !isValidTimeZone(timezone)) {
    throw new ValidationError(`"${timezone}" is not a recognised time zone`);
  }
  if (!db.select().from(repo).where(eq(repo.id, repoId)).get()) {
    throw new ValidationError(`no repo with id ${repoId}`);
  }
}

/** A blank override is the same as none: both mean "the machine's own local time". */
function normalizeTimezone(timezone: string | undefined): string | null {
  return timezone?.trim() ? timezone.trim() : null;
}

export function createTask(db: Db, body: CreateTaskBody) {
  const timezone = normalizeTimezone(body.timezone);
  assertValidTask(db, { ...body, timezone });
  return db
    .insert(task)
    .values({ ...body, timezone, id: crypto.randomUUID() })
    .returning()
    .get();
}

export function updateTask(db: Db, id: string, patch: UpdateTaskBody) {
  const current = getTask(db, id);
  if (!current) return undefined;
  const timezone = patch.timezone === undefined ? current.timezone : normalizeTimezone(patch.timezone);
  assertValidTask(db, {
    repoId: patch.repoId ?? current.repoId,
    schedule: patch.schedule ?? current.schedule,
    timezone,
  });
  return db
    .update(task)
    .set({ ...patch, timezone, updatedAt: new Date() })
    .where(eq(task.id, id))
    .returning()
    .get();
}

/** Flips `enabled` only — never re-validates the repo or schedule, so a repo removed later can't block pausing a task that already exists. */
export function setTaskEnabled(db: Db, id: string, enabled: boolean) {
  return db.update(task).set({ enabled, updatedAt: new Date() }).where(eq(task.id, id)).returning().get();
}

export function deleteTask(db: Db, id: string): void {
  db.delete(task).where(eq(task.id, id)).run();
}

/** A task with the repo it runs in, for whatever starts a run of it. */
export function getTaskWithRepo(db: Db, id: string) {
  const row = db.select().from(task).innerJoin(repo, eq(task.repoId, repo.id)).where(eq(task.id, id)).get();
  return row ? { ...row.task, repo: row.repo } : undefined;
}

function toApiRun(row: typeof run.$inferSelect): ApiRun {
  const { transcriptJson, usageJson, modelUsageJson, startedAt, finishedAt, ...rest } = row;
  return {
    ...rest,
    startedAt: startedAt.getTime(),
    finishedAt: finishedAt?.getTime() ?? null,
    usage: usageJson,
    modelUsage: modelUsageJson,
  };
}

function toApiRunDetail(row: typeof run.$inferSelect): ApiRunDetail {
  return { ...toApiRun(row), transcript: (row.transcriptJson as unknown[]) ?? null };
}

export function insertRun(
  db: Db,
  values: { id: string; taskId: string; trigger: RunTrigger; startedAt: Date },
): ApiRun {
  return toApiRun(db.insert(run).values({ ...values, status: 'running' }).returning().get());
}

/**
 * A run that never reaches `runTask` at all: the scheduler found the task's
 * previous run still `running` when this one came due, so it records the
 * skip — `startedAt` and `finishedAt` both now — instead of starting a
 * second one alongside it.
 */
export function recordSkippedRun(db: Db, values: { id: string; taskId: string; reason: string }): ApiRun {
  const now = new Date();
  return toApiRun(
    db
      .insert(run)
      .values({
        id: values.id,
        taskId: values.taskId,
        trigger: 'scheduled',
        status: 'skipped',
        startedAt: now,
        finishedAt: now,
        errorMessage: values.reason,
      })
      .returning()
      .get(),
  );
}

export interface RunStatusPatch {
  status?: RunStatus;
  finishedAt?: Date | null;
  resultText?: string | null;
  totalCostUsd?: number | null;
  usageJson?: unknown | null;
  modelUsageJson?: unknown | null;
  numTurns?: number | null;
  errorMessage?: string | null;
  transcriptJson?: unknown | null;
}

/** The row a run's lifecycle is folded into as it goes, and once at the end. */
export function setRunStatus(db: Db, id: string, patch: RunStatusPatch): ApiRun | undefined {
  const updated = db.update(run).set(patch).where(eq(run.id, id)).returning().get();
  return updated ? toApiRun(updated) : undefined;
}

/**
 * The most recent run of a task, for the list view's status badge, the
 * scheduler's own overlap check, and runTask's own guard against starting a
 * second run on top of one still `running`. `skipped` rows are excluded: one
 * written while a real run is still in flight would otherwise look like the
 * latest run and hide it, clearing the "Running…" state all three depend on.
 * Null when nothing else has ever run.
 */
export function getLatestRun(db: Db, taskId: string): ApiRun | null {
  const row = db
    .select()
    .from(run)
    .where(and(eq(run.taskId, taskId), ne(run.status, 'skipped')))
    .orderBy(desc(run.startedAt))
    .get();
  return row ? toApiRun(row) : null;
}

/** A task's full run history, newest first — the transcript isn't needed here, only in getRun. */
export function listRuns(db: Db, taskId: string): ApiRun[] {
  return db.select().from(run).where(eq(run.taskId, taskId)).orderBy(desc(run.startedAt)).all().map(toApiRun);
}

/** A single run with its transcript, for the run detail view. */
export function getRun(db: Db, id: string): ApiRunDetail | undefined {
  const row = db.select().from(run).where(eq(run.id, id)).get();
  return row ? toApiRunDetail(row) : undefined;
}

/** A transcript message's own tool_use blocks — read defensively, since the SDK's message shape isn't ours to narrow. */
function toolUseNames(message: unknown): string[] {
  const content = (message as { message?: { content?: unknown } }).message?.content;
  if (!Array.isArray(content)) return [];
  return content
    .filter((block: { type?: string; name?: unknown }) => block.type === 'tool_use' && typeof block.name === 'string')
    .map((block: { name: string }) => block.name);
}

/** An MCP tool call's own server, e.g. `slack` out of `mcp__slack__send_message`; anything else is a local/built-in tool. */
function toolBucket(name: string): string {
  return /^mcp__(.+?)__/.exec(name)?.[1] ?? 'Other';
}

/**
 * How often a task's runs have called each tool, tallied by walking every
 * run's transcriptJson rather than sending transcripts to the client to
 * count themselves. Sorted most-called first.
 */
export function getToolUsage(db: Db, taskId: string): ApiToolUsage[] {
  const rows = db.select({ transcriptJson: run.transcriptJson }).from(run).where(eq(run.taskId, taskId)).all();

  const tally = new Map<string, { callCount: number; runCount: number }>();
  for (const { transcriptJson } of rows) {
    const messages = (transcriptJson as unknown[] | null) ?? [];
    const bucketsInRun = new Set<string>();
    for (const message of messages) {
      for (const toolName of toolUseNames(message)) {
        const bucket = toolBucket(toolName);
        const entry = tally.get(bucket) ?? { callCount: 0, runCount: 0 };
        entry.callCount += 1;
        tally.set(bucket, entry);
        bucketsInRun.add(bucket);
      }
    }
    for (const bucket of bucketsInRun) {
      tally.get(bucket)!.runCount += 1;
    }
  }

  return [...tally.entries()]
    .map(([name, counts]) => ({ name, ...counts }))
    .sort((a, b) => b.callCount - a.callCount);
}

/**
 * Catches whatever a crash or a restart left behind: a run whose process is
 * gone but whose row still says `running`, which nothing would otherwise ever
 * change again. Called once, at startup.
 */
export function failOrphanedRuns(db: Db): void {
  db.update(run)
    .set({ status: 'failed', errorMessage: 'server restarted mid-run', finishedAt: new Date() })
    .where(eq(run.status, 'running'))
    .run();
}
