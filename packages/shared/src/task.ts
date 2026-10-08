import { z } from 'zod';
import { EFFORT_LEVELS, TASK_MODELS, type EffortLevel, type TaskModel } from './model.js';

/**
 * A scheduled AI task: a prompt, a repo to run it in, and a cron schedule.
 * This is its definition, not a run of it — see ApiRun for that.
 */
export interface ApiTask {
  id: string;
  name: string;
  prompt: string;
  repoId: string;
  /** The repo's own name, carried inline so the list view needs one round trip. */
  repoName: string;
  /** A 5-field cron expression, evaluated in `timezone` when set, otherwise the machine's own local time. */
  schedule: string;
  /** An IANA zone name, e.g. `America/Chicago`. Null to run `schedule` in the machine's own local time. */
  timezone: string | null;
  /** The next instant `schedule` is due, as epoch ms. Computed fresh on every read, not stored. */
  nextRunTime: number | null;
  /** Null means the CLI's own default — auto mode, no model pinned. */
  model: TaskModel | null;
  effort: EffortLevel | null;
  /**
   * MCP servers whose tool calls run unattended instead of being denied —
   * see runs/claude.ts. Null means none pre-approved, the behaviour every
   * task had before this existed; `[]` means the same thing but was set
   * explicitly. Server names here are whatever the repo's own MCP config
   * calls them, not a closed list the way `model` is.
   */
  allowedMcpServers: string[] | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export const CreateTaskBody = z.object({
  name: z.string().min(1, 'name is required'),
  prompt: z.string().min(1, 'prompt is required'),
  repoId: z.string().min(1, 'repoId is required'),
  schedule: z.string().min(1, 'schedule is required'),
  timezone: z.string().optional(),
  model: z.enum(TASK_MODELS).nullable().optional(),
  effort: z.enum(EFFORT_LEVELS).nullable().optional(),
  allowedMcpServers: z.array(z.string()).nullable().optional(),
});
export type CreateTaskBody = z.infer<typeof CreateTaskBody>;

export const UpdateTaskBody = z.object({
  name: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  repoId: z.string().min(1).optional(),
  schedule: z.string().min(1).optional(),
  timezone: z.string().optional(),
  model: z.enum(TASK_MODELS).nullable().optional(),
  effort: z.enum(EFFORT_LEVELS).nullable().optional(),
  allowedMcpServers: z.array(z.string()).nullable().optional(),
});
export type UpdateTaskBody = z.infer<typeof UpdateTaskBody>;
