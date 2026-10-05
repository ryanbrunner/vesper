import { statSync } from 'node:fs';
import { asc, desc, eq } from 'drizzle-orm';
import { isValidCron, type ApiRepo, type ApiTask, type CreateTaskBody, type UpdateTaskBody } from '@vesper/shared';
import type { Db } from './client.js';
import { repo, task } from './schema.js';

/** Thrown for anything a 400 should report back with a readable `detail`. */
export class ValidationError extends Error {}

/** Thrown when a repo cannot be deleted because a task still references it. */
export class RepoInUseError extends Error {}

export function listRepos(db: Db): ApiRepo[] {
  return db.select().from(repo).orderBy(asc(repo.name)).all();
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
  return db.insert(repo).values({ ...values, id: crypto.randomUUID() }).returning().get();
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
  enabled: task.enabled,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
};

function toApiTask(row: { createdAt: Date; updatedAt: Date } & Omit<ApiTask, 'createdAt' | 'updatedAt'>): ApiTask {
  return { ...row, createdAt: row.createdAt.getTime(), updatedAt: row.updatedAt.getTime() };
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

function assertValidTask(db: Db, { repoId, schedule }: { repoId: string; schedule: string }) {
  if (!isValidCron(schedule)) {
    throw new ValidationError(`"${schedule}" is not a valid cron expression`);
  }
  if (!db.select().from(repo).where(eq(repo.id, repoId)).get()) {
    throw new ValidationError(`no repo with id ${repoId}`);
  }
}

export function createTask(db: Db, body: CreateTaskBody) {
  assertValidTask(db, body);
  return db
    .insert(task)
    .values({ ...body, id: crypto.randomUUID() })
    .returning()
    .get();
}

export function updateTask(db: Db, id: string, patch: UpdateTaskBody) {
  const current = getTask(db, id);
  if (!current) return undefined;
  assertValidTask(db, {
    repoId: patch.repoId ?? current.repoId,
    schedule: patch.schedule ?? current.schedule,
  });
  return db
    .update(task)
    .set({ ...patch, updatedAt: new Date() })
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
