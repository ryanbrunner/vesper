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
  /** A 5-field cron expression, evaluated in server-local time. */
  schedule: string;
  /** Null means the CLI's own default — auto mode, no model pinned. */
  model: TaskModel | null;
  effort: EffortLevel | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export const CreateTaskBody = z.object({
  name: z.string().min(1, 'name is required'),
  prompt: z.string().min(1, 'prompt is required'),
  repoId: z.string().min(1, 'repoId is required'),
  schedule: z.string().min(1, 'schedule is required'),
  model: z.enum(TASK_MODELS).nullable().optional(),
  effort: z.enum(EFFORT_LEVELS).nullable().optional(),
});
export type CreateTaskBody = z.infer<typeof CreateTaskBody>;

export const UpdateTaskBody = z.object({
  name: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  repoId: z.string().min(1).optional(),
  schedule: z.string().min(1).optional(),
  model: z.enum(TASK_MODELS).nullable().optional(),
  effort: z.enum(EFFORT_LEVELS).nullable().optional(),
});
export type UpdateTaskBody = z.infer<typeof UpdateTaskBody>;
