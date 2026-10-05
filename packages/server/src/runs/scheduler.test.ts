import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lastDueAt } from '@vesper/shared';
import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { createRepo, createTask, getLatestRun, setTaskEnabled, updateTask } from '../db/queries.js';
import { run } from '../db/schema.js';
import { testDb, testRepoDir } from '../routes/test-helpers.js';
import type { QueryFn } from './claude.js';
import { startScheduler } from './scheduler.js';

function setUp(schedule = '* * * * *') {
  const db = testDb();
  const repo = createRepo(db, { name: 'vesper', path: testRepoDir() });
  const task = createTask(db, { name: 'nightly', prompt: 'do the thing', repoId: repo.id, schedule });
  return { db, task };
}

const init: SDKMessage = { type: 'system', subtype: 'init', permissionMode: 'auto' } as SDKMessage;

/** A fake SDK that finishes a successful run on its very next message. */
function succeeding(): QueryFn {
  return (() => {
    async function* gen(): AsyncGenerator<SDKMessage> {
      yield init;
      yield { type: 'result', subtype: 'success', result: 'done', num_turns: 1 } as unknown as SDKMessage;
    }
    return gen();
  }) as unknown as QueryFn;
}

/** A fake SDK that hangs forever, so the run it starts stays `running`. */
function hanging(): QueryFn {
  return (({ options }: { options: Options }) => {
    async function* gen(): AsyncGenerator<SDKMessage> {
      yield init;
      await new Promise((_, reject) => options.abortController!.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    }
    return gen();
  }) as unknown as QueryFn;
}

/** A clock a test can move forward one tick at a time. */
function clock(start: Date) {
  const box = { at: start };
  return { now: () => box.at, advance: (ms: number) => (box.at = new Date(box.at.getTime() + ms)) };
}

test('a boundary crossed by less than a second between ticks still fires', async () => {
  const { db, task } = setUp();
  const time = clock(new Date('2024-01-01T00:00:59.500Z'));
  const scheduler = startScheduler(db, { now: time.now, query: succeeding(), tickMs: 1_000_000 });
  try {
    time.advance(750); // lands at 00:01:00.250Z, just past the minute boundary
    scheduler.tick();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(getLatestRun(db, task.id)?.status, 'succeeded');
  } finally {
    scheduler.stop();
  }
});

test('a due task fires through runTask, recorded with trigger scheduled', async () => {
  const { db, task } = setUp();
  const time = clock(new Date('2024-01-01T00:00:30Z'));
  const scheduler = startScheduler(db, { now: time.now, query: succeeding(), tickMs: 1_000_000 });
  try {
    time.advance(60_000); // crosses the 00:01:00 minute boundary
    scheduler.tick();
    await new Promise((r) => setTimeout(r, 10)); // let the fake SDK's microtasks settle

    const latest = getLatestRun(db, task.id);
    assert.equal(latest?.trigger, 'scheduled');
    assert.equal(latest?.status, 'succeeded');
  } finally {
    scheduler.stop();
  }
});

test('a paused task is never fired, no matter how many boundaries pass', () => {
  const { db, task } = setUp();
  setTaskEnabled(db, task.id, false);
  const time = clock(new Date('2024-01-01T00:00:30Z'));
  const scheduler = startScheduler(db, { now: time.now, query: succeeding(), tickMs: 1_000_000 });
  try {
    time.advance(120_000);
    scheduler.tick();
    assert.equal(getLatestRun(db, task.id), null);
  } finally {
    scheduler.stop();
  }
});

test('editing a schedule changes the next due time on the very next tick', async () => {
  const { db, task } = setUp('0 0 1 1 *'); // once a year: nothing due for a long time
  const time = clock(new Date('2024-01-01T00:00:30Z'));
  const scheduler = startScheduler(db, { now: time.now, query: succeeding(), tickMs: 1_000_000 });
  try {
    time.advance(60_000);
    scheduler.tick();
    assert.equal(getLatestRun(db, task.id), null); // the old schedule wasn't due yet

    updateTask(db, task.id, { schedule: '* * * * *' });
    time.advance(60_000);
    scheduler.tick();
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(getLatestRun(db, task.id)?.status, 'succeeded');
  } finally {
    scheduler.stop();
  }
});

test('a task still running when it comes due again is skipped, not run twice', async () => {
  const { db, task } = setUp();
  const time = clock(new Date('2024-01-01T00:00:30Z'));
  const scheduler = startScheduler(db, { now: time.now, query: hanging(), tickMs: 1_000_000 });
  try {
    time.advance(60_000);
    scheduler.tick();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(getLatestRun(db, task.id)?.status, 'running');

    time.advance(60_000);
    scheduler.tick();

    // The in-flight run is still the latest one the badge or "Run now" would see...
    assert.equal(getLatestRun(db, task.id)?.status, 'running');
    // ...but a skipped run was recorded alongside it.
    const skipped = db
      .select()
      .from(run)
      .all()
      .find((r) => r.status === 'skipped');
    assert.ok(skipped);
    assert.equal(skipped?.trigger, 'scheduled');
    assert.match(skipped?.errorMessage ?? '', /still going/);
  } finally {
    scheduler.stop();
  }
});

test('no backlog is replayed on start-up, even if the schedule was already due', () => {
  const { db, task } = setUp();
  // The very moment the scheduler starts is already mid-minute, well past
  // the most recent :00 boundary — but nothing should fire for it.
  const time = clock(new Date('2024-01-01T00:00:45Z'));
  const scheduler = startScheduler(db, { now: time.now, query: succeeding(), tickMs: 1_000_000 });
  try {
    assert.equal(getLatestRun(db, task.id), null);
  } finally {
    scheduler.stop();
  }
});

test('lastDueAt honours a task’s own time zone rather than always UTC', () => {
  const at = new Date('2024-06-01T12:00:00Z');
  const utc = lastDueAt('0 0 * * *', at, 'UTC');
  const farEast = lastDueAt('0 0 * * *', at, 'Pacific/Kiritimati'); // UTC+14
  assert.notEqual(utc.getTime(), farEast.getTime());
});

test('a task fires in its own time zone, not the machine running the tick', async () => {
  const { db, task } = setUp('0 2 * * *');
  updateTask(db, task.id, { timezone: 'UTC' });
  const time = clock(new Date('2024-01-01T01:59:30Z'));
  const scheduler = startScheduler(db, { now: time.now, query: succeeding(), tickMs: 1_000_000 });
  try {
    time.advance(60_000); // 02:00:30Z — 02:00 has come due in UTC
    scheduler.tick();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(getLatestRun(db, task.id)?.status, 'succeeded');
  } finally {
    scheduler.stop();
  }
});

test('the same clock does not fire a task scheduled against a time zone hours ahead', () => {
  const { db, task } = setUp('0 2 * * *');
  updateTask(db, task.id, { timezone: 'Pacific/Kiritimati' }); // UTC+14: 02:00 there is 12:00 the day before, in UTC
  const time = clock(new Date('2024-01-01T01:59:30Z'));
  const scheduler = startScheduler(db, { now: time.now, query: succeeding(), tickMs: 1_000_000 });
  try {
    time.advance(60_000);
    scheduler.tick();
    assert.equal(getLatestRun(db, task.id), null);
  } finally {
    scheduler.stop();
  }
});

test('a gap wide enough to be a sleep or a stall is treated like a restart: no catch-up', async () => {
  const { db, task } = setUp();
  const time = clock(new Date('2024-01-01T00:00:30Z'));
  const scheduler = startScheduler(db, { now: time.now, query: succeeding(), tickMs: 15_000 });
  try {
    time.advance(3 * 60 * 60 * 1000); // 3 hours, as if the machine slept through it
    scheduler.tick();
    assert.equal(getLatestRun(db, task.id), null);

    // Ordinary ticking afterwards still works, each gap well under the
    // sleep threshold, and still fires once a boundary is actually crossed.
    time.advance(25_000);
    scheduler.tick();
    assert.equal(getLatestRun(db, task.id), null);

    time.advance(25_000);
    scheduler.tick();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(getLatestRun(db, task.id)?.status, 'succeeded');
  } finally {
    scheduler.stop();
  }
});
