import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });

// A registry of local directories a task can run its prompt against. Unrelated
// to Reeve's own `repo` table (worktrees, lifecycle commands, pull requests).
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
  // A 5-field cron expression, evaluated in `timezone` when set, otherwise
  // the machine's own local time.
  schedule: text('schedule').notNull(),
  // An IANA zone name. Null to run `schedule` in the machine's own local time.
  timezone: text('timezone'),
  // Both nullable with no default: null means "the CLI's own default", so
  // every task that predates these columns keeps today's behaviour untouched.
  model: text('model', { enum: ['sonnet', 'opus', 'haiku', 'fable'] }),
  effort: text('effort', { enum: ['low', 'medium', 'high', 'xhigh', 'max'] }),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: timestamp('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: timestamp('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
});

export const run = sqliteTable('run', {
  id: text('id').primaryKey(),
  // `cascade`, unlike the repo's `restrict`: a run is history belonging to its
  // task, not a resource the task borrows, so deleting the task takes its runs
  // with it rather than refusing the delete.
  taskId: text('task_id').notNull().references(() => task.id, { onDelete: 'cascade' }),
  trigger: text('trigger', { enum: ['manual', 'scheduled'] }).notNull(),
  status: text('status', { enum: ['running', 'succeeded', 'failed', 'cancelled', 'skipped'] }).notNull(),
  startedAt: timestamp('started_at').notNull().default(sql`(unixepoch() * 1000)`),
  finishedAt: timestamp('finished_at'),
  // Claude's own closing text, when the run got that far.
  resultText: text('result_text'),
  totalCostUsd: real('total_cost_usd'),
  // The SDK result message's `usage` object, stored as-is: its shape is the
  // SDK's to define, not ours to narrow. Main-agent-loop tokens only; see
  // modelUsageJson for the field the SDK itself calls the correct one.
  usageJson: text('usage_json', { mode: 'json' }),
  // Per-model totals, including subagents — the SDK's own doc comment on
  // `usage` calls this the field to prefer for token/cost accounting.
  modelUsageJson: text('model_usage_json', { mode: 'json' }),
  numTurns: integer('num_turns'),
  errorMessage: text('error_message'),
  // The run's own `assistant`/`user` SDK messages, in order — everything else
  // the SDK emits (status, progress, hooks, ...) is noise the run detail view
  // has no use for, so claude.ts filters it out before this is ever set.
  transcriptJson: text('transcript_json', { mode: 'json' }),
});
