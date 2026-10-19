import { useQuery } from '@tanstack/react-query';
import { asBlocks, blockText, summarizeToolUsage, type TranscriptBlock, type TranscriptMessageShape } from '@vesper/shared';
import { api } from '../lib/api.js';
import { CloseIcon } from '../ui/Glyph.js';
import { formatCost, formatDuration, STATUS_COLOR, STATUS_LABEL, STATUS_MODAL_GLOW } from './runFormat.js';
import { Rail, StatusLight } from './StatusLight.js';
import { ToolUsagePanel } from './ToolUsage.js';

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
  const toolUsage = summarizeToolUsage(run.data?.transcript);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 px-4">
      <div
        className={`relative flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg border p-5 ${
          run.data ? STATUS_MODAL_GLOW[run.data.status] : 'border-edge bg-panel shadow-xl'
        }`}
      >
        <div className="mb-4 flex items-center gap-3">
          {run.data && <StatusLight status={run.data.status} size={28} />}
          <div className="min-w-0 flex-1">
            <h2 className={`font-medium ${run.data ? STATUS_COLOR[run.data.status] : 'text-text'}`}>
              {run.data ? STATUS_LABEL[run.data.status] : 'Loading…'}
            </h2>
            {run.data && (
              <p className="tnum truncate font-mono text-xs text-muted">
                {run.data.trigger} · started {new Date(run.data.startedAt).toLocaleString()} ·{' '}
                {formatDuration(run.data)} · {formatCost(run.data.totalCostUsd)}
              </p>
            )}
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close" title="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {run.data?.errorMessage && (
            <p className="mb-3 whitespace-pre-wrap rounded-md border border-activity-error-border bg-activity-error-fill p-3 text-sm text-activity-error-mark">
              {run.data.errorMessage}
            </p>
          )}

          {run.data?.resultText && (
            <div className="mb-4">
              <p className="mb-1 font-mono text-xs uppercase tracking-wide text-muted">Result</p>
              <p className="whitespace-pre-wrap text-sm text-text">{run.data.resultText}</p>
            </div>
          )}

          {toolUsage.length > 0 && (
            <div className="mb-4">
              <ToolUsagePanel usage={toolUsage} />
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
        {run.data?.status === 'running' && <Rail />}
      </div>
    </div>
  );
}
