import { config } from '../config.js';
import { createApp } from '../index.js';
import { createRepo, createTask, insertRun, listRepos, setRunStatus, setTaskEnabled } from './queries.js';

/**
 * One assistant turn that calls a single tool, with a plausible usage
 * figure attached — the shape `runs/claude.ts` stores straight off the SDK.
 * No MCP servers are wired up yet (that's a separate card), so nothing a
 * real run produces can exercise the tool-usage panel; this fabricates a
 * transcript that can, so Testing has something to capture.
 */
function assistantToolCall(name: string, input: unknown, usage: { input_tokens: number; output_tokens: number }) {
  return {
    type: 'assistant',
    message: {
      content: [{ type: 'tool_use', name, input }],
      usage,
    },
  };
}

const { db } = createApp();
if (listRepos(db).length === 0) {
  // config.root rather than process.cwd(), which is wherever this script was
  // launched from (packages/server under `npm run db:seed`, the repo root
  // under `npm test` from the top) — this repo points at itself either way.
  const vesper = createRepo(db, { name: 'vesper', path: config.root });
  const reeve = createRepo(db, { name: 'reeve', path: '/Users/ryan/code/reeve' });

  createTask(db, {
    name: 'Nightly dependency audit',
    prompt: 'Run npm audit across the workspace and open a note for anything new.',
    repoId: vesper.id,
    schedule: '0 2 * * *', // Daily 02:00
  });

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

  createTask(db, {
    name: 'CI flake watch',
    prompt: 'Check the last 6 hours of CI runs for intermittent failures.',
    repoId: vesper.id,
    schedule: '0 */6 * * *', // Every 6 hours
  });

  const monthlyReport = createTask(db, {
    name: 'Monthly usage report',
    prompt: 'Compile last month\'s token usage by repo into a report.',
    repoId: reeve.id,
    schedule: '0 6 1 * *', // 1st of the month 06:00
  });
  setTaskEnabled(db, monthlyReport.id, false);

  // A fixed id, not crypto.randomUUID(), so '/?run=seed-run-tool-usage' is a
  // deterministic capture URL for the tool-usage panel.
  const toolUsageRun = insertRun(db, {
    id: 'seed-run-tool-usage',
    taskId: weeklyReview.id,
    trigger: 'manual',
    startedAt: new Date(),
  });
  setRunStatus(db, toolUsageRun.id, {
    status: 'succeeded',
    finishedAt: new Date(),
    resultText: 'Reviewed the backlog across every connected integration and flagged three stale cards.',
    totalCostUsd: 0.42,
    numTurns: 10,
    transcriptJson: [
      assistantToolCall('mcp__slack__post_message', { channel: '#backlog', text: 'Weekly review is up.' }, { input_tokens: 820, output_tokens: 140 }),
      assistantToolCall('mcp__notion__search', { query: 'backlog review' }, { input_tokens: 610, output_tokens: 95 }),
      assistantToolCall('mcp__linear__list_issues', { team: 'vesper', state: 'stale' }, { input_tokens: 540, output_tokens: 160 }),
      assistantToolCall('mcp__github__search_issues', { query: 'is:open label:stale' }, { input_tokens: 700, output_tokens: 180 }),
      assistantToolCall('mcp__gmail__search', { query: 'backlog digest' }, { input_tokens: 480, output_tokens: 90 }),
      assistantToolCall('mcp__google_drive__search', { query: 'backlog review notes' }, { input_tokens: 390, output_tokens: 70 }),
      assistantToolCall('mcp__google_calendar__list_events', { calendarId: 'primary' }, { input_tokens: 350, output_tokens: 60 }),
      assistantToolCall('WebSearch', { query: 'backlog grooming best practices' }, { input_tokens: 300, output_tokens: 120 }),
      // Local filesystem/bash access, already wired today — excluded from the tool-usage panel.
      assistantToolCall('Bash', { command: 'git log --oneline -20' }, { input_tokens: 220, output_tokens: 50 }),
      assistantToolCall('Read', { file_path: 'Backlog.md' }, { input_tokens: 260, output_tokens: 40 }),
    ],
  });

  console.log('[vesper] seeded 2 repos, 5 tasks, 1 tool-usage run');
} else {
  console.log('[vesper] already seeded');
}
