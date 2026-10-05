import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';

/**
 * A fresh, migrated in-memory database for a single test. Never
 * `createApp()` here — that opens `config.dbFile`, the real `data/vesper.db`.
 */
export function testDb(): Db {
  const db = openDatabase(':memory:');
  runMigrations(db);
  return db;
}

/** A directory `createRepo` will accept, since it stats the path it's given. */
export function testRepoDir(): string {
  return mkdtempSync(join(tmpdir(), 'vesper-test-'));
}

/** `Response#json()` types as `unknown`; tests just want the body back. */
export function json(res: Response): Promise<any> {
  return res.json();
}
