import type { ReactNode } from 'react'

/**
 * A labelled value in a detail pane. `beside` starts every value at one x; `beside-top` puts the
 * label at a long value's first line; `above` is for wide values (notes, chips) that are read.
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
