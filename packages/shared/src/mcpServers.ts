/**
 * One MCP server a repo has configured, as the CLI's own `mcpServerStatus()`
 * reports it — passed through from packages/server/src/runs/mcpServers.ts.
 */
export interface ApiMcpServer {
  /** The server's own configured name, e.g. `slack` or `claude.ai Supercast`. */
  name: string;
  label: string;
  status: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled';
}

export interface McpServersResponse {
  servers: ApiMcpServer[];
}
