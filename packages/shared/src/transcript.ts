/** One content block of an SDK message's `message.content`, read defensively — its shape is the SDK's to define, not ours. */
export interface TranscriptBlock {
  type?: string;
  text?: string;
  thinking?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
}

/** The shape of one entry in a run's stored transcript — an SDK `assistant` or `user` message. */
export interface TranscriptMessageShape {
  type?: 'assistant' | 'user';
  parent_tool_use_id?: string | null;
  message?: {
    content?: string | TranscriptBlock[];
    /**
     * The SDK's own usage figures for this one message. Per the SDK's type
     * comment, a mid-stream `assistant` message's usage is "not final" —
     * only the terminal `result` message's usage is reliable — but that's
     * the only per-message figure there is, so `summarizeToolUsage` below
     * uses it as an approximation.
     */
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}

export function asBlocks(content: string | TranscriptBlock[] | undefined): TranscriptBlock[] {
  if (content == null) return [];
  return typeof content === 'string' ? [{ type: 'text', text: content }] : content;
}

/** A tool result's own content is the same string-or-blocks shape as a message's. */
export function blockText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b: TranscriptBlock) => b.text ?? JSON.stringify(b))
      .join('\n');
  }
  return JSON.stringify(content);
}

/** Known MCP server slugs, mapped to the display name the tool-usage panel shows. */
export const INTEGRATION_LABELS: Record<string, string> = {
  slack: 'Slack',
  notion: 'Notion',
  linear: 'Linear',
  github: 'GitHub',
  gmail: 'Gmail',
  google_drive: 'Drive',
  google_calendar: 'Calendar',
};

/** One integration's tool usage across a run's transcript. */
export interface IntegrationUsage {
  /** The MCP server slug, or 'web_search' for the one built-in tool this groups. */
  key: string;
  label: string;
  calls: number;
  tokens: number;
}

/** A readable fallback label for an MCP server slug the panel doesn't already know a name for. */
function titleCase(slug: string): string {
  return slug
    .split(/[_-]/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * The integration a `tool_use` block's name belongs to, or null for a local
 * tool (Bash, Read, Edit, Write, Grep, Glob, Task, TodoWrite, ...) — those
 * are the task's existing filesystem/bash access, not an integration, and
 * never appear in the tool-usage panel.
 *
 * `WebSearch` is the one built-in (non-MCP) tool the panel also tracks.
 * Everything else that counts is the SDK's own `mcp__<server>__<tool>`
 * naming convention, split on `__` with the server as the integration key.
 */
function integrationFor(name: string | undefined): { key: string; label: string } | null {
  if (!name) return null;
  if (name === 'WebSearch') return { key: 'web_search', label: 'Web search' };
  if (!name.startsWith('mcp__')) return null;
  const parts = name.split('__');
  const server = parts[1];
  if (!server) return null;
  return { key: server, label: INTEGRATION_LABELS[server] ?? titleCase(server) };
}

/**
 * Groups a run's transcript's `tool_use` calls by integration, with a call
 * count and an approximate token count per integration.
 *
 * Token accounting is approximate and double-counts on purpose: the SDK
 * gives no per-tool-call token figure, only each `assistant` message's own
 * (not-final-until-the-end) `usage`. This attributes that message's own
 * input+output (plus cache fields, if present) tokens once to every
 * distinct integration the message's tool_use blocks touch — so a single
 * message that calls both Slack and Notion counts its tokens fully toward
 * both, rather than splitting them.
 */
export function summarizeToolUsage(transcript: unknown[] | null | undefined): IntegrationUsage[] {
  const byKey = new Map<string, IntegrationUsage>();

  for (const entry of transcript ?? []) {
    const message = entry as TranscriptMessageShape;
    if (message.type !== 'assistant') continue;
    const blocks = asBlocks(message.message?.content);
    const toolBlocks = blocks.filter((b) => b.type === 'tool_use');
    if (toolBlocks.length === 0) continue;

    const usage = message.message?.usage;
    const messageTokens = usage
      ? (usage.input_tokens ?? 0) +
        (usage.output_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0)
      : 0;

    const touched = new Set<string>();
    for (const block of toolBlocks) {
      const integration = integrationFor(block.name);
      if (!integration) continue;

      let usageEntry = byKey.get(integration.key);
      if (!usageEntry) {
        usageEntry = { key: integration.key, label: integration.label, calls: 0, tokens: 0 };
        byKey.set(integration.key, usageEntry);
      }
      usageEntry.calls += 1;
      touched.add(integration.key);
    }

    for (const key of touched) {
      byKey.get(key)!.tokens += messageTokens;
    }
  }

  return [...byKey.values()];
}
