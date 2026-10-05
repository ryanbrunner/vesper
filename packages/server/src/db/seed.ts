import { config } from '../config.js';
import { createApp } from '../index.js';
import { createRepo, createTask, listRepos, setTaskEnabled } from './queries.js';

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

  console.log('[vesper] seeded 2 repos, 5 tasks');
} else {
  console.log('[vesper] already seeded');
}
