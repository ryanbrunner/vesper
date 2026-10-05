import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';

/**
 * Answering the permission prompts nobody is there to answer.
 *
 * A run starts in auto mode, so the SDK's own classifier is the policy: it
 * approves whatever Claude Code's auto mode would approve inside the task's
 * repo, and escalates the rest to this callback. Nobody is watching a
 * scheduled or "Run now" task to approve anything by hand, so the answer here
 * is always no — ported from Reeve, which reached the same answer for the
 * same reason (see its runs/permissions.ts).
 *
 * The refusal still says something useful rather than just "no": it names the
 * call, says only that call was refused, and tells the run to find another
 * way and carry on — a run that reads a bare denial tends to generalise it
 * into "nothing works" and gives up on everything instead of just the one
 * call.
 */
export function decideToolUse(toolName: string, input: Record<string, unknown>): PermissionResult {
  const command = typeof input['command'] === 'string' ? input['command'].trim() : '';
  return {
    behavior: 'deny',
    message: toolName === 'Bash' && command ? bashDenial(command) : toolDenial(toolName, input),
  };
}

function bashDenial(command: string): string {
  return [
    `Denied: \`${short(command)}\`.`,
    'Auto mode would not approve this one command, and nobody is watching this run to approve it by hand.',
    'Only this call was refused — every other command and every other tool still works: find another way to do',
    'what this one was for and carry on. Running the same command again will be refused again.',
  ].join(' ');
}

function toolDenial(toolName: string, input: Record<string, unknown>): string {
  const what = Object.values(identifying(input))[0];
  return [
    `Denied: this ${toolName} call${what ? ` (\`${short(what)}\`)` : ''}.`,
    'Auto mode would not approve it, and nobody is watching this run to approve it by hand.',
    `Only this call was refused, not ${toolName} and not your other tools: find another way to do what it was for`,
    'and carry on.',
  ].join(' ');
}

/** Which call it was, and nothing more — a `Write` input is a whole file. */
function identifying(input: Record<string, unknown>): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const key of ['command', 'file_path', 'path', 'url', 'pattern']) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) kept[key] = value.slice(0, 200);
  }
  return kept;
}

/** Enough of the command to recognise it, on one line. */
function short(command: string): string {
  const oneLine = command.replace(/\s+/g, ' ').trim();
  return oneLine.length > 120 ? `${oneLine.slice(0, 117)}…` : oneLine;
}
