import type { Heading } from '../logic/outline'

/**
 * A NOTE'S OUTLINE (REQ-002 FR-109, artboard 34): its headings down the right of the page, the
 * section the cursor is in marked; a press jumps there. A note with no headings has none.
 */
export function NoteOutline({
  headings,
  current,
  onJump,
}: {
  headings: readonly Heading[]
  current: Heading | null
  onJump: (heading: Heading) => void
}) {
  if (headings.length === 0) return null
  return (
    <nav
      aria-label="Outline"
      className="sticky top-0 hidden w-56 shrink-0 self-start border-l border-line py-1 pl-3 xl:block"
    >
      <h2 className="px-2 pb-2 text-meta text-muted">Outline</h2>
      <ul className="flex flex-col gap-px">
        {headings.map((h) => {
          const here = h === current
          return (
            <li key={h.offset}>
              <button
                type="button"
                aria-current={here ? 'location' : undefined}
                onClick={() => onJump(h)}
                className={`flex h-7 w-full items-center rounded-control px-2 text-left text-ui hover:bg-hover ${
                  h.depth === 2 ? 'pl-5' : ''
                } ${here ? 'bg-select text-ink' : 'text-muted'}`}
              >
                <span className="truncate">{h.words}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
