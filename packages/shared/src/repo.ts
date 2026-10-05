import { z } from 'zod';

/**
 * A directory a task can run its prompt in — the `cwd` its run gets. Kept
 * thin: just a name and an absolute path, checked against the filesystem on
 * create.
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
