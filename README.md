An eventual home for AI scheduled task management

## Running a task

A task's prompt runs through the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`,
the same one Reeve's server uses), in the task's repo. There is exactly one
way to start a run — `runTask(db, taskId, trigger)` in
`packages/server/src/runs/claude.ts` — so a "Run now" click and the scheduler
card, once it exists, both go through it and both leave the same kind of
record behind: a `run` row with the task, how it was triggered, when it
started and finished, its status, Claude's final output, cost and token
usage where the SDK reports them, and an error message when it failed.

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
