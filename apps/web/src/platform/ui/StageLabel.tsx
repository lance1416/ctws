/**
 * A node's stage (FR-040, DES-001 section 4): a muted dot and the name on a grey label; a stage
 * folded by default is subtle, dot and word.
 */
export function StageLabel({ name, quiet }: { name: string; quiet: boolean }) {
  return (
    <span
      data-stage-label
      className={`inline-flex h-5.5 min-w-0 items-center gap-1.5 rounded-control bg-hover px-2 text-meta ${
        quiet ? 'text-subtle' : 'text-ink'
      }`}
    >
      <span className="sr-only">Stage </span>
      <i
        aria-hidden="true"
        className={`size-1.5 shrink-0 rounded-full ${quiet ? 'bg-subtle' : 'bg-muted'}`}
      />
      <span className="truncate">{name}</span>
    </span>
  )
}
