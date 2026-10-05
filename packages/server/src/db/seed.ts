import { config } from '../config.js';
import { createApp } from '../index.js';
import { createRepo, createTask, getRun, insertRun, listRepos, listTasks, setRunStatus, setTaskEnabled } from './queries.js';

/** An assistant message calling one tool — enough shape for getToolUsage and the transcript viewer to read. */
function toolUseMessage(name: string, input: unknown = {}) {
  return { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name, input }] } };
}

/**
 * One assistant tool call, with a plausible usage figure attached, and the
 * matching user-turn tool_result that follows it in a real transcript — the
 * shape `runs/claude.ts` stores straight off the SDK. No MCP servers are
 * wired up yet (that's a separate card), so nothing a real run produces can
 * exercise the tool-usage panel; this fabricates a transcript that can, so
 * Testing has something to capture.
 */
function toolCallPair(
  name: string,
  input: unknown,
  result: string,
  usage: { input_tokens: number; output_tokens: number },
) {
  return [
    {
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name, input }], usage },
    },
    {
      type: 'user',
      message: { content: [{ type: 'tool_result', content: result }] },
    },
  ];
}

const { db } = createApp();
let weeklyReviewId: string | undefined;
if (listRepos(db).length === 0) {
  // config.root rather than process.cwd(), which is wherever this script was
  // launched from (packages/server under `npm run db:seed`, the repo root
  // under `npm test` from the top) — this repo points at itself either way.
  const vesper = createRepo(db, { name: 'vesper', path: config.root });
  const reeve = createRepo(db, { name: 'reeve', path: '/Users/ryan/code/reeve' });

  const audit = createTask(db, {
    name: 'Nightly dependency audit',
    prompt: 'Run npm audit across the workspace and open a note for anything new.',
    repoId: vesper.id,
    schedule: '0 2 * * *', // Daily 02:00
  });

  // A mixed run history with real tool_use blocks, so the run-history strip
  // and the Tools tab both have something to show on a freshly seeded board.
  const hourAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);
  const succeeded1 = insertRun(db, { id: crypto.randomUUID(), taskId: audit.id, trigger: 'scheduled', startedAt: hourAgo(96) });
  setRunStatus(db, succeeded1.id, {
    status: 'succeeded',
    finishedAt: hourAgo(96),
    resultText: 'No new advisories.',
    totalCostUsd: 0.014,
    numTurns: 3,
    transcriptJson: [toolUseMessage('Bash', { command: 'npm audit --json' }), toolUseMessage('Read', { file_path: 'package-lock.json' })],
  });
  const failed = insertRun(db, { id: crypto.randomUUID(), taskId: audit.id, trigger: 'scheduled', startedAt: hourAgo(72) });
  setRunStatus(db, failed.id, {
    status: 'failed',
    finishedAt: hourAgo(72),
    errorMessage: 'npm audit exited with code 1',
    totalCostUsd: 0.006,
    numTurns: 1,
    transcriptJson: [toolUseMessage('Bash', { command: 'npm audit --json' })],
  });
  const cancelled = insertRun(db, { id: crypto.randomUUID(), taskId: audit.id, trigger: 'manual', startedAt: hourAgo(48) });
  setRunStatus(db, cancelled.id, {
    status: 'cancelled',
    finishedAt: hourAgo(48),
    transcriptJson: [toolUseMessage('Bash', { command: 'npm audit --json' })],
  });
  const succeeded2 = insertRun(db, { id: crypto.randomUUID(), taskId: audit.id, trigger: 'scheduled', startedAt: hourAgo(24) });
  setRunStatus(db, succeeded2.id, {
    status: 'succeeded',
    finishedAt: hourAgo(24),
    resultText: 'One new advisory, opened a note.',
    totalCostUsd: 0.021,
    numTurns: 4,
    transcriptJson: [
      toolUseMessage('Bash', { command: 'npm audit --json' }),
      toolUseMessage('Read', { file_path: 'package-lock.json' }),
      toolUseMessage('Write', { file_path: 'notes/advisory.md' }),
    ],
  });
  // Left running: a run with no finishedAt, so the run-history strip has a
  // fifth, distinct mark. Only lasts until the server actually starts,
  // though — failOrphanedRuns reaps any row still `running` at boot, the
  // same as it would a real one orphaned by a restart, so running `npm run
  // db:seed` and then starting the server leaves this one `failed` instead.
  insertRun(db, { id: crypto.randomUUID(), taskId: audit.id, trigger: 'manual', startedAt: new Date() });

  createTask(db, {
    name: 'Morning standup digest',
    prompt: 'Summarize yesterday\'s commits and open PRs into a short digest.',
    repoId: reeve.id,
    schedule: '30 7 * * 1-5', // Weekdays 07:30
  });

  const weeklyReview = createTask(db, {
    name: 'Weekly backlog review',
    prompt: 'Read Backlog and flag any card that has gone stale.',
    repoId: reeve.id,
    schedule: '0 21 * * 0', // Sundays 21:00
  });
  setTaskEnabled(db, weeklyReview.id, false);
  weeklyReviewId = weeklyReview.id;

  createTask(db, {
    name: 'CI flake watch',
    prompt: 'Check the last 6 hours of CI runs for intermittent failures.',
    repoId: vesper.id,
    schedule: '0 */6 * * *', // Every 6 hours
    model: 'opus',
    effort: 'high',
  });

  const monthlyReport = createTask(db, {
    name: 'Monthly usage report',
    prompt: 'Compile last month\'s token usage by repo into a report.',
    repoId: reeve.id,
    schedule: '0 6 1 * *', // 1st of the month 06:00
  });
  setTaskEnabled(db, monthlyReport.id, false);

  console.log('[vesper] seeded 2 repos, 5 tasks');
} else {
  console.log('[vesper] already seeded');
}

const TOOL_USAGE_RUN_ID = 'seed-run-tool-usage';
// Kept outside the `listRepos` guard above, and keyed on its own fixed id
// rather than the "already seeded" check: a DB seeded before this run
// existed would otherwise never get it, and '/?run=seed-run-tool-usage'
// would 404 forever.
if (!getRun(db, TOOL_USAGE_RUN_ID)) {
  const task = weeklyReviewId ?? listTasks(db)[0]?.id;
  if (task) {
    const startedAt = new Date(Date.now() - 90_000);
    const toolUsageRun = insertRun(db, { id: TOOL_USAGE_RUN_ID, taskId: task, trigger: 'manual', startedAt });
    setRunStatus(db, toolUsageRun.id, {
      status: 'succeeded',
      finishedAt: new Date(),
      resultText: 'Reviewed the backlog across every connected integration and flagged three stale cards.',
      totalCostUsd: 0.42,
      numTurns: 10,
      transcriptJson: [
        ...toolCallPair('mcp__slack__post_message', { channel: '#backlog', text: 'Weekly review is up.' }, 'ok', { input_tokens: 820, output_tokens: 140 }),
        ...toolCallPair('mcp__notion__search', { query: 'backlog review' }, '3 pages found', { input_tokens: 610, output_tokens: 95 }),
        ...toolCallPair('mcp__linear__list_issues', { team: 'vesper', state: 'stale' }, '2 issues', { input_tokens: 540, output_tokens: 160 }),
        ...toolCallPair('mcp__github__search_issues', { query: 'is:open label:stale' }, '1 issue', { input_tokens: 700, output_tokens: 180 }),
        ...toolCallPair('mcp__gmail__search', { query: 'backlog digest' }, 'no matches', { input_tokens: 480, output_tokens: 90 }),
        ...toolCallPair('mcp__google_drive__search', { query: 'backlog review notes' }, '1 doc found', { input_tokens: 390, output_tokens: 70 }),
        ...toolCallPair('mcp__google_calendar__list_events', { calendarId: 'primary' }, 'no conflicts', { input_tokens: 350, output_tokens: 60 }),
        ...toolCallPair('WebSearch', { query: 'backlog grooming best practices' }, 'top 5 results', { input_tokens: 300, output_tokens: 120 }),
        // Local filesystem/bash access, already wired today — excluded from the tool-usage panel.
        ...toolCallPair('Bash', { command: 'git log --oneline -20' }, '20 commits', { input_tokens: 220, output_tokens: 50 }),
        ...toolCallPair('Read', { file_path: 'Backlog.md' }, 'file contents', { input_tokens: 260, output_tokens: 40 }),
      ],
    });
    console.log('[vesper] seeded 1 tool-usage run');
  }
}
