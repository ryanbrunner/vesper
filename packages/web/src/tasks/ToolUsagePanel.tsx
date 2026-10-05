import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

/**
 * How often a task's runs have called each tool, as a simple bar list — a
 * call count per tool, computed server-side from transcripts (see
 * queries.ts's getToolUsage) rather than counted here from a transcript the
 * client would otherwise have to fetch just for this. No per-tool token or
 * cost figure: ApiRun only stores those per run, not per tool call.
 */
export function ToolUsagePanel({ taskId }: { taskId: string }) {
  const usage = useQuery({ queryKey: ['toolUsage', taskId], queryFn: () => api.toolUsage(taskId) });

  if (usage.isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (!usage.data?.length) return <p className="text-sm text-muted">No tool calls recorded yet.</p>;

  const max = Math.max(...usage.data.map((u) => u.callCount));

  return (
    <ul className="flex flex-col gap-2">
      {usage.data.map((u) => (
        <li key={u.name} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate font-mono text-xs text-muted">{u.name}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-edge">
            <div className="h-full rounded-full bg-enabled-mark" style={{ width: `${(u.callCount / max) * 100}%` }} />
          </div>
          <span className="w-16 shrink-0 text-right font-mono text-xs text-text">
            {u.callCount} {u.callCount === 1 ? 'call' : 'calls'}
          </span>
        </li>
      ))}
    </ul>
  );
}
