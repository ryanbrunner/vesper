import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });

// A registry of local directories a task can run its prompt against. Unrelated
// to Reeve's own `repo` table (worktrees, lifecycle commands, pull requests):
// Vesper's tasks don't run yet, so this is just a name and a checked path.
export const repo = sqliteTable('repo', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  path: text('path').notNull(),
  createdAt: timestamp('created_at').notNull().default(sql`(unixepoch() * 1000)`),
});

export const task = sqliteTable('task', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  prompt: text('prompt').notNull(),
  // `restrict` rather than `cascade`: a repo still backing a task must be kept,
  // not silently taken out from under it. The delete-repo route checks this
  // itself first, so the refusal carries a readable `detail` instead of a bare
  // SQLite constraint error.
  repoId: text('repo_id').notNull().references(() => repo.id, { onDelete: 'restrict' }),
  // A 5-field cron expression, evaluated in server-local time.
  schedule: text('schedule').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: timestamp('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: timestamp('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
});
