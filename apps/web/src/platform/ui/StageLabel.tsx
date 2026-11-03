/**
 * A node's stage. A stage folded by default has a hollow dot and a muted word.
 */
export function StageLabel({ name, quiet }: { name: string; quiet: boolean }) {
  return (
    <span
      data-stage-label
      className={`inline-flex h-5.5 min-w-0 items-center gap-1.5 rounded-control bg-hover px-2 text-meta ${
        quiet ? 'text-muted' : 'text-ink'
      }`}
    >
      <span className="sr-only">Stage </span>
      <i
        aria-hidden="true"
        className={`size-1.5 shrink-0 rounded-full ${quiet ? 'border-[1.5px] border-muted' : 'bg-muted'}`}
      />
      <span className="truncate">{name}</span>
    </span>
  )
}
