import { query, type McpServerStatus, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

/**
 * Long enough for a cold CLI start plus MCP connections to settle. A pending
 * server past this is reported as-is, same spirit as DISCOVERY_TIMEOUT_MS in
 * runs/models.ts, but longer: MCP connection is a separate, slower, async
 * step than the model handshake that one waits on. Also the ceiling on the
 * whole poll loop, not just the gap between calls, so a single
 * `mcpServerStatus()` call that never resolves can't hold a run forever —
 * the same reason models.ts races `supportedModels()` against a timeout.
 */
const DISCOVERY_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;

export interface McpServerInfo {
  name: string;
  status: McpServerStatus['status'];
  /** Empty unless `status` is `connected` — the CLI only reports a server's own tools once it's up. */
  tools: string[];
}

/** Whether two answers name exactly the same set of servers. */
function sameNames(a: McpServerStatus[], b: McpServerStatus[]): boolean {
  if (a.length !== b.length) return false;
  const names = new Set(a.map((s) => s.name));
  return b.every((s) => names.has(s.name));
}

/**
 * Polls `getStatus` until two consecutive answers agree on which servers
 * exist and none of them is still `pending`, or `timeoutMs` elapses,
 * whichever comes first. Exported so a test can drive it against a stubbed
 * `getStatus` rather than a real CLI.
 *
 * Two consecutive answers, not just one with nothing `pending`: a server
 * that hasn't loaded its config yet simply doesn't appear in the list at
 * all, so an empty (or partial) first answer looks exactly like "nothing
 * configured" unless a second call confirms the same set still holds.
 */
export async function pollUntilSettled(
  getStatus: () => Promise<McpServerStatus[]>,
  timeoutMs = DISCOVERY_TIMEOUT_MS,
  intervalMs = POLL_INTERVAL_MS,
): Promise<McpServerStatus[]> {
  const deadline = Date.now() + timeoutMs;
  let previous: McpServerStatus[] | null = null;
  let statuses = await getStatus();
  while (Date.now() < deadline) {
    const noneStillPending = statuses.every((s) => s.status !== 'pending');
    if (noneStillPending && previous !== null && sameNames(previous, statuses)) break;
    previous = statuses;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    statuses = await getStatus();
  }
  return statuses;
}

function toInfo(s: McpServerStatus): McpServerInfo {
  return { name: s.name, status: s.status, tools: s.tools?.map((t) => t.name) ?? [] };
}

/**
 * Asks the CLI which MCP servers a repo has configured, and what tools each
 * one offers once connected — the same control-channel pattern
 * runs/models.ts's `discover()` uses for `supportedModels()`: the query is
 * opened with a prompt that never yields, so no turn is taken and nothing is
 * spent, then closed as soon as the answer is in.
 *
 * Unlike the model handshake, MCP startup is non-blocking, so the first
 * answer can be missing a server entirely, or report one still `pending` —
 * this polls via `pollUntilSettled` rather than trusting the first call, and
 * races the whole poll against `DISCOVERY_TIMEOUT_MS` so a CLI that never
 * settles doesn't hold this open forever.
 */
async function discover(repoPath: string): Promise<McpServerInfo[]> {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  async function* idle(): AsyncIterable<SDKUserMessage> {
    await held;
  }

  const q = query({ prompt: idle(), options: { cwd: repoPath, permissionPrompts: 'none' } });
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no settled answer in ${DISCOVERY_TIMEOUT_MS / 1000}s`)), DISCOVERY_TIMEOUT_MS);
    });
    const statuses = await Promise.race([pollUntilSettled(() => q.mcpServerStatus()), timeout]);
    return statuses.map(toInfo);
  } finally {
    clearTimeout(timer);
    q.close();
    release();
  }
}

/**
 * Builds a per-repo-path cached lookup over `discoverFn`, each repo path
 * asked once and kept — until a result says otherwise. A failure to reach
 * the CLI at all, or an answer that still came back empty or with a server
 * still `pending`, answers `[]` (or that partial list) and is asked again on
 * the next call rather than remembered: a server that hasn't finished
 * loading, or an empty list from a CLI that hasn't reported anything yet,
 * may look completely different moments later. A `failed` or `needs-auth`
 * server is kept, though — those are stable CLI-reported states that only
 * change when someone reauthorizes, not states that resolve themselves on a
 * later poll, and a server stuck there (a claude.ai connector pending
 * authorization, say) must not pin every lookup against this repo to a
 * fresh CLI handshake for as long as it stays that way.
 *
 * Exported as a factory, not just the one instance below, so a test can
 * drive the caching behaviour against a stubbed `discoverFn` rather than a
 * real CLI.
 */
export function cachedMcpServerLookup(
  discoverFn: (repoPath: string) => Promise<McpServerInfo[]>,
): (repoPath: string) => Promise<McpServerInfo[]> {
  const cache = new Map<string, Promise<McpServerInfo[]>>();

  return (repoPath: string) => {
    const cached = cache.get(repoPath);
    if (cached) return cached;

    const result = discoverFn(repoPath)
      .then((servers) => {
        if (servers.length === 0 || servers.some((s) => s.status === 'pending')) cache.delete(repoPath);
        return servers;
      })
      .catch((err: unknown) => {
        console.log(`[vesper] could not list MCP servers for ${repoPath}: ${String(err)}`);
        cache.delete(repoPath);
        return [];
      });
    cache.set(repoPath, result);
    return result;
  };
}

/**
 * Cached per repo path, not in a single process-wide slot the way
 * listModels() caches models: MCP servers are configured per repo
 * (`cwd: task.repo.path`), so a task against one repo must never see
 * another repo's servers.
 */
export const listMcpServers = cachedMcpServerLookup(discover);
