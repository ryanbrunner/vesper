import { query, type McpServerStatus, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

/**
 * Long enough for a cold CLI start plus MCP connections to settle. A pending
 * server past this is reported as-is, same spirit as DISCOVERY_TIMEOUT_MS in
 * runs/models.ts, but longer: MCP connection is a separate, slower, async
 * step than the model handshake that one waits on.
 */
const DISCOVERY_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;

export interface McpServerInfo {
  name: string;
  status: McpServerStatus['status'];
  /** Empty unless `status` is `connected` — the CLI only reports a server's own tools once it's up. */
  tools: string[];
}

/**
 * Polls `getStatus` until no server it reports is still `pending`, or
 * `timeoutMs` elapses, whichever comes first. Exported so a test can drive
 * it against a stubbed `getStatus` rather than a real CLI.
 */
export async function pollUntilSettled(
  getStatus: () => Promise<McpServerStatus[]>,
  timeoutMs = DISCOVERY_TIMEOUT_MS,
  intervalMs = POLL_INTERVAL_MS,
): Promise<McpServerStatus[]> {
  const deadline = Date.now() + timeoutMs;
  let statuses = await getStatus();
  while (statuses.some((s) => s.status === 'pending') && Date.now() < deadline) {
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
 * answer can report a server still `pending` with no tools yet — this polls
 * via `pollUntilSettled` rather than trusting the first call.
 */
async function discover(repoPath: string): Promise<McpServerInfo[]> {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  async function* idle(): AsyncIterable<SDKUserMessage> {
    await held;
  }

  const q = query({ prompt: idle(), options: { cwd: repoPath, permissionPrompts: 'none' } });
  try {
    const statuses = await pollUntilSettled(() => q.mcpServerStatus());
    return statuses.map(toInfo);
  } finally {
    q.close();
    release();
  }
}

/**
 * Cached per repo path, not in a single process-wide slot the way
 * listModels() caches models: MCP servers are configured per repo
 * (`cwd: task.repo.path`), so a task against one repo must never see
 * another repo's servers.
 */
const cache = new Map<string, Promise<McpServerInfo[]>>();

/**
 * Every MCP server a repo has configured, and its tools, each asked once per
 * repo path and kept — until a result says otherwise. A failure to reach the
 * CLI at all answers `[]` and is asked again on the next call, same as
 * listModels(). A result that settled with a server still `pending`,
 * `failed`, or `needs-auth` is not kept either: that server may connect on a
 * later run, and pinning the unsettled answer for the process lifetime would
 * strand its pre-approval on the bare wildcard fallback until a restart.
 */
export function listMcpServers(repoPath: string): Promise<McpServerInfo[]> {
  const cached = cache.get(repoPath);
  if (cached) return cached;

  const result = discover(repoPath)
    .then((servers) => {
      if (servers.some((s) => s.status !== 'connected')) cache.delete(repoPath);
      return servers;
    })
    .catch((err: unknown) => {
      console.log(`[vesper] could not list MCP servers for ${repoPath}: ${String(err)}`);
      cache.delete(repoPath);
      return [];
    });
  cache.set(repoPath, result);
  return result;
}
