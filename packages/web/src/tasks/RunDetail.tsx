import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { formatCost, formatDuration, STATUS_COLOR } from './runFormat.js';

/** One content block of an SDK message's `message.content`, read defensively — its shape is the SDK's to define, not ours. */
interface TranscriptBlock {
  type?: string;
  text?: string;
  thinking?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
}

/** The shape of one entry in a run's stored transcript — an SDK `assistant` or `user` message. */
interface TranscriptMessageShape {
  type?: 'assistant' | 'user';
  parent_tool_use_id?: string | null;
  message?: { content?: string | TranscriptBlock[] };
}

function asBlocks(content: string | TranscriptBlock[] | undefined): TranscriptBlock[] {
  if (content == null) return [];
  return typeof content === 'string' ? [{ type: 'text', text: content }] : content;
}

/** A tool result's own content is the same string-or-blocks shape as a message's. */
function blockText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b: TranscriptBlock) => b.text ?? JSON.stringify(b))
      .join('\n');
  }
  return JSON.stringify(content);
}

/**
 * One block of one transcript message: assistant text, a tool call and its
 * input, a tool's result, or a thinking block — whatever block types show up
 * get a JSON fallback rather than being silently dropped.
 */
function TranscriptBlockView({ block }: { block: TranscriptBlock }) {
  if (block.type === 'tool_use') {
    return (
      <div>
        <p className="font-mono text-xs uppercase tracking-wide text-muted">Tool: {block.name ?? 'unknown'}</p>
        <pre className="overflow-x-auto rounded bg-ink px-2 py-1 font-mono text-xs text-text">
          {JSON.stringify(block.input, null, 2)}
        </pre>
      </div>
    );
  }
  if (block.type === 'tool_result') {
    return (
      <div>
        <p className="font-mono text-xs uppercase tracking-wide text-muted">Tool result</p>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-ink px-2 py-1 font-mono text-xs text-text">
          {blockText(block.content)}
        </pre>
      </div>
    );
  }
  if (block.type === 'thinking') {
    return <p className="whitespace-pre-wrap text-sm italic text-muted">{block.thinking}</p>;
  }
  if (block.type === 'text' || block.text) {
    return <p className="whitespace-pre-wrap text-sm text-text">{block.text}</p>;
  }
  return <pre className="overflow-x-auto rounded bg-ink px-2 py-1 font-mono text-xs text-muted">{JSON.stringify(block)}</pre>;
}

/** One transcript message. Subagent output (a non-null `parent_tool_use_id`) is indented under the tool call that started it. */
function TranscriptMessage({ message }: { message: unknown }) {
  const m = message as TranscriptMessageShape;
  const blocks = asBlocks(m.message?.content);
  const isSubagent = Boolean(m.parent_tool_use_id);

  return (
    <li className={isSubagent ? 'ml-4 border-l border-edge pl-3' : ''}>
      <div className="flex flex-col gap-1">
        {blocks.map((block, i) => (
          <TranscriptBlockView key={i} block={block} />
        ))}
      </div>
    </li>
  );
}

/**
 * One run's full detail: Claude's own closing text, the error if it failed,
 * and the transcript — the SDK's own assistant/user messages, with tool
 * calls and their results. Polls while the run is still going, the same
 * pattern TaskList's own LatestRun uses, so this fills in live rather than
 * needing a reload.
 */
export function RunDetail({ runId, onClose }: { runId: string; onClose: () => void }) {
  const run = useQuery({
    queryKey: ['run', runId],
    queryFn: () => api.run(runId),
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 2000 : false),
  });

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 px-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-edge bg-panel p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className={`font-mono text-sm uppercase tracking-wide ${run.data ? STATUS_COLOR[run.data.status] : 'text-text'}`}>
            {run.data?.status ?? 'Loading…'}
          </h2>
          <button onClick={onClose} className="text-sm text-muted hover:text-text">
            Close
          </button>
        </div>

        {run.data && (
          <p className="mb-3 font-mono text-xs text-muted">
            {run.data.trigger} · started {new Date(run.data.startedAt).toLocaleString()} · {formatDuration(run.data)} ·{' '}
            {formatCost(run.data.totalCostUsd)}
          </p>
        )}

        <div className="flex-1 overflow-y-auto">
          {run.data?.errorMessage && (
            <p className="mb-3 whitespace-pre-wrap rounded border border-red-900 bg-red-950/40 p-2 text-sm text-red-400">
              {run.data.errorMessage}
            </p>
          )}

          {run.data?.resultText && (
            <div className="mb-4">
              <p className="mb-1 font-mono text-xs uppercase tracking-wide text-muted">Result</p>
              <p className="whitespace-pre-wrap text-sm text-text">{run.data.resultText}</p>
            </div>
          )}

          <div>
            <p className="mb-1 font-mono text-xs uppercase tracking-wide text-muted">Transcript</p>
            {!run.data?.transcript?.length ? (
              <p className="text-sm text-muted">Nothing yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {run.data.transcript.map((message, i) => (
                  <TranscriptMessage key={i} message={message} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
