import type { ApiRun } from '@vesper/shared';
import { STATUS_LABEL } from './runFormat.js';

/**
 * A run's state as a lit disc with a glyph in it, so state is never colour
 * alone: a check, a cross, a spinning arc, a stop square, a skip. `null` is a
 * task that has never run: a dashed, unlit ring.
 */
export function StatusLight({
  status,
  size = 32,
  className = '',
}: {
  status: ApiRun['status'] | null;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`status-light light-${status ?? 'none'} ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={status ? STATUS_LABEL[status] : 'Never run'}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {status === 'running' && (
          <>
            <circle cx="12" cy="12" r="8" opacity="0.25" />
            <path className="light-spin" d="M12 4a8 8 0 0 1 8 8" />
          </>
        )}
        {status === 'succeeded' && <path d="M6 12.5l4 4 8-9" />}
        {status === 'failed' && <path d="M7 7l10 10M17 7L7 17" />}
        {status === 'cancelled' && <rect x="8" y="8" width="8" height="8" rx="1.5" />}
        {status === 'skipped' && <path d="M7 6.5l7 5.5-7 5.5zM17.5 6v12" />}
        {status === null && <circle cx="12" cy="12" r="2" />}
      </svg>
    </span>
  );
}

/** The sliding light along a running row's bottom edge. */
export function Rail() {
  return (
    <div className="card-rail" aria-hidden="true">
      <span />
    </div>
  );
}
