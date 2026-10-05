import type { IntegrationUsage } from '@vesper/shared';
import { formatTokens } from './runFormat.js';

/**
 * Per-integration tool usage for one run: a row per MCP server (or web
 * search) the transcript's `tool_use` blocks touched, with a call count and
 * an approximate token count. Rendered only when `usage` is non-empty —
 * RunDetail skips this section entirely for a run with no integration
 * calls, which today is every real run until MCP servers are wired up.
 */
export function ToolUsagePanel({ usage }: { usage: IntegrationUsage[] }) {
  return (
    <div>
      <p className="mb-1 font-mono text-xs uppercase tracking-wide text-muted">Tool usage</p>
      <ul className="flex flex-col gap-1 rounded bg-ink px-2 py-1">
        {usage.map((integration) => (
          <li key={integration.key} className="flex items-center justify-between font-mono text-xs text-text">
            <span>{integration.label}</span>
            <span className="text-muted">
              {integration.calls} call{integration.calls === 1 ? '' : 's'} · {formatTokens(integration.tokens)} tokens
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
