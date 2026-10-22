/**
 * A parent's progress where a leaf has its status (FR-043): a square, filled from the left by the
 * share of its tree that is done, as the tree's rollup counts it. Drawn rather than coloured
 * alone, so it reads in grey too; its name says the number.
 */
export function ProgressSquare({ progress }: { progress: number | null }) {
  const label = progress === null ? 'Not counted' : `${Math.round(progress * 100)}% done`
  return (
    <svg
      role="img"
      aria-label={label}
      data-progress-square={progress ?? ''}
      viewBox="0 0 16 16"
      width={16}
      height={16}
      className="shrink-0"
    >
      <title>{label}</title>
      <rect
        x="0.75"
        y="0.75"
        width="14.5"
        height="14.5"
        rx="3.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-ink"
      />
      {progress !== null && progress > 0 && (
        <rect x="3" y="3" width={10 * progress} height="10" rx="1.25" className="fill-go" />
      )}
    </svg>
  )
}
