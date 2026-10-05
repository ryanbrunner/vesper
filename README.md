An eventual home for AI scheduled task management

## Running a task

A task's prompt runs through the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`,
the same one Reeve's server uses), in the task's repo. There is exactly one
way to start a run — `runTask(db, taskId, trigger)` in
`packages/server/src/runs/claude.ts` — so a "Run now" click and the scheduler
both go through it and both leave the same kind of record behind: a `run`
row with the task, how it was triggered, when it started and finished, its
status, Claude's final output, cost and token usage where the SDK reports
them, and an error message when it failed.

**Auth** is left entirely to the SDK's own CLI: the Claude Code login, or
`ANTHROPIC_API_KEY` in the environment, whichever it finds. Nothing in Vesper
configures either one.

**Permissions**: every run starts in `permissionMode: 'auto'`, with `cwd` set
to the task's repo. That is the same classifier Claude Code's own auto mode
uses, scoped to that one directory — Claude can read files, edit them, and
run commands there, exactly as auto mode would allow a person's own session
to do unattended. Anything auto mode's classifier would escalate instead of
deciding on its own is refused outright, because these runs are unattended
and nobody is there to approve it by hand. A denial names the call and says
only that one call was refused, so the run can find another way and carry on
rather than giving up on everything.

## Scheduling

While the server is up, `startScheduler` (`packages/server/src/runs/scheduler.ts`)
wakes up every 15 seconds, reads every enabled task's current `schedule` and
`timezone`, and calls `runTask(db, taskId, 'scheduled')` for any whose cron
expression has come due since the last time it looked. Four things were
decided along the way:

- **Overlap.** If a task's own latest run is still `running` when its
  schedule comes due again, that occurrence is skipped rather than run a
  second time alongside it — recorded as a `run` with `status: 'skipped'`,
  which shows up in the task's run history (but never as its latest run).
- **Missed runs.** No backlog is ever replayed, and there is no "catch-up"
  run either: a task's own high-water mark starts at the moment the
  scheduler first sees it — on boot, or when the task is first created — so
  nothing fires for a boundary crossed before that, whether the server was
  down or the task was simply paused.
- **Time zone.** A schedule is evaluated in the machine's own local time
  zone, unless the task sets its own `timezone` (an IANA zone name, e.g.
  `America/Chicago`).
- **Pausing and editing are immediate.** The scheduler re-reads the task
  table on every tick rather than keeping its own copy, so pausing a task
  stops its future runs, and editing its schedule or time zone changes its
  next due time, as of the very next tick — no route needs to tell it.
