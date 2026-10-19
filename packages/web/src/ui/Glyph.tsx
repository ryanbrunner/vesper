/**
 * The Vesper mark: a V with a star rising over it, the evening star the name
 * means. Same construction as Reeve's: a pale letterform and one sky diamond.
 */
export function Glyph() {
  return (
    <svg className="h-5 w-auto overflow-visible" viewBox="0 0 36 40" role="img" aria-label="Vesper">
      <path d="M4 10l14 26 14-26" fill="none" stroke="#e6edf3" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 -6l4 6-4 6-4-6z" fill="#00a6f4" />
    </svg>
  );
}

/** Line icons on a 16px grid, drawn in `currentColor`; `.icon-btn` and `.btn-primary` size and stroke them. */
function Icon({ children, className = 'h-3.5 w-3.5 shrink-0' }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const PlayIcon = () => <Icon><path d="M4.5 2.75v10.5l8.5-5.25z" /></Icon>;
export const PauseIcon = () => <Icon><path d="M5.25 3v10M10.75 3v10" /></Icon>;
export const HistoryIcon = () => (
  <Icon>
    <path d="M2.5 8a5.5 5.5 0 1 0 1.8-4.1L2.5 5.5" />
    <path d="M2.5 2.5v3h3M8 5v3.2l2 1.3" />
  </Icon>
);
export const PencilIcon = () => <Icon><path d="M10.5 3l2.5 2.5L5.5 13H3v-2.5z" /></Icon>;
export const TrashIcon = () => (
  <Icon>
    <path d="M2.75 4.25h10.5M6.25 4.25V2.75h3.5v1.5M4 4.25l.6 8.5h6.8l.6-8.5M6.75 7v3.5M9.25 7v3.5" />
  </Icon>
);
export const PlusIcon = () => <Icon><path d="M8 3v10M3 8h10" /></Icon>;
export const ClockIcon = () => <Icon><circle cx="8" cy="8" r="5.75" /><path d="M8 4.75V8l2.25 1.5" /></Icon>;
export const BranchIcon = () => (
  <Icon>
    <circle cx="4.5" cy="3.75" r="1.5" />
    <circle cx="4.5" cy="12.25" r="1.5" />
    <circle cx="11.5" cy="6" r="1.5" />
    <path d="M4.5 5.25v5.5M11.5 7.5c0 2.5-3 2-7 3.25" />
  </Icon>
);
export const SparkIcon = () => <Icon><path d="M8 2l1.5 4.5L14 8l-4.5 1.5L8 14l-1.5-4.5L2 8l4.5-1.5z" /></Icon>;
export const ArrowLeftIcon = () => <Icon><path d="M13 8H3M7 4L3 8l4 4" /></Icon>;
export const FolderIcon = () => <Icon><path d="M2 4.5a1 1 0 0 1 1-1h3l1.5 1.75H13a1 1 0 0 1 1 1V11.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" /></Icon>;
export const CloseIcon = () => <Icon><path d="M4 4l8 8M12 4l-8 8" /></Icon>;
