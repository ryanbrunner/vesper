/**
 * The runs currently in flight, so a cancel request made after the HTTP
 * response that started one still has something to reach. Nothing here is
 * persisted — a restart loses the map, and `failOrphanedRuns` is what notices.
 */
export interface RunHandle {
  cancel: () => void;
}

const runs = new Map<string, RunHandle>();

export const runRegistry = {
  register(runId: string, handle: RunHandle): void {
    runs.set(runId, handle);
  },
  unregister(runId: string): void {
    runs.delete(runId);
  },
  /** True if a run with this id was found and asked to cancel. */
  cancel(runId: string): boolean {
    const handle = runs.get(runId);
    if (!handle) return false;
    handle.cancel();
    return true;
  },
};
