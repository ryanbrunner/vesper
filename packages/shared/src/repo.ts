import { z } from 'zod';

/**
 * A directory a task can run its prompt in. Deliberately thin — a name and an
 * absolute path, checked against the filesystem on create — because nothing
 * here executes a task yet; this is just a place to point one at.
 */
export interface ApiRepo {
  id: string;
  name: string;
  path: string;
}

export const CreateRepoBody = z.object({
  name: z.string().min(1, 'name is required'),
  path: z.string().min(1, 'path is required'),
});
export type CreateRepoBody = z.infer<typeof CreateRepoBody>;
