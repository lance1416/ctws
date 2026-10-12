import type { ReactNode } from 'react'

/**
 * A LABELLED VALUE in a detail pane, in the one of three shapes the value asks for.
 *
 * `beside` puts the label in a fixed column, so every value on the page starts at one x -- which
 * is what makes a pane of short values scannable. `beside-top` is the same column with the label
 * at the first line of a value that runs to several.
 *
 * `above` is for a value that is WIDER THAN THE COLUMN LEAVES: notes, a set of chips, a list of
 * addresses. Keeping those beside their label would cost them a fifth of the pane, and they are
 * read rather than scanned, so there is nothing to line up.
 */
export function Field({
  label,
  shape = 'beside',
  children,
}: {
  label: string
  shape?: 'beside' | 'beside-top' | 'above'
  children: ReactNode
}) {
  if (shape === 'above') {
    return (
      <div>
        <span className="block text-xs text-ink-muted">{label}</span>
        <div className="mt-1">{children}</div>
      </div>
    )
  }
  const top = shape === 'beside-top'
  return (
    <div className={`flex gap-2 ${top ? 'items-start' : 'items-center'}`}>
      <span className={`w-20 shrink-0 text-xs text-ink-muted ${top ? 'pt-2' : ''}`}>{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  )
}
