import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');

/**
 * Where the database lives when `VESPER_DB` does not say.
 *
 * A checkout keeps it in its own gitignored `data/`, so development does not
 * change. Anything else is an installed copy, and gets `~/.vesper` on every
 * platform, following Reeve's own reasoning: a packaged install's own
 * directory is no place to write, and an upgrade that moves it would leave a
 * database behind.
 */
export function defaultDataDir({ checkout, root, home }: { checkout: boolean; root: string; home: string }): string {
  return checkout ? resolve(root, 'data') : resolve(home, '.vesper');
}

// "Is there a .git", rather than sniffing the path, so it holds for any
// packaging. In a worktree `.git` is a file rather than a directory, and
// still counts.
const dataDir = defaultDataDir({ checkout: existsSync(resolve(root, '.git')), root, home: homedir() });

export const config = {
  root,
  /** The default home of the database. Only a default: `VESPER_DB` wins outright. */
  dataDir,
  dbFile: process.env.VESPER_DB ?? resolve(dataDir, 'vesper.db'),
  // Part of the install rather than the user's data, so this stays beside the
  // code wherever the database goes.
  migrationsFolder: resolve(root, 'packages/server/drizzle'),
  webDist: resolve(root, 'packages/web/dist'),
  port: Number(process.env.VESPER_PORT ?? 4417),
  /** Loopback only: there is no auth yet. */
  hostname: '127.0.0.1',
} as const;
