import { HANG } from './hang'

/** A screen's empty line: the state itself; the way to fill it is the page's own. */
export function EmptyState({
  title,
  hang = false,
}: {
  /** The state itself, plain and present tense. */
  title: string
  /** On a page of rows: on the margin's edge, where the page's title and its headings hang. */
  hang?: boolean
}) {
  return (
    <div className={`mt-8 max-w-[44ch] ${hang ? HANG : ''}`}>
      <p className="text-ink">{title}</p>
    </div>
  )
}
