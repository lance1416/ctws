import type { ReactNode } from 'react'

/**
 * A LABELLED ROW in a detail pane: the label in a fixed column, so every value on the page starts
 * at one x.
 *
 * Written twice, identically, in the contact pane and the meeting pane -- and when the interface
 * went to English the column had to be widened in both, because "Company" and "Time zone" are
 * wider than the two characters it was cut for. One of the two would eventually not be.
 */
export function Field({
  label,
  top = false,
  children,
}: {
  label: string
  /** Align the label to the TOP, for a value that is taller than one line. */
  top?: boolean
  children: ReactNode
}) {
  return (
    <div className={`flex gap-2 ${top ? 'items-start' : 'items-center'}`}>
      <span className={`w-20 shrink-0 text-xs text-fg-muted ${top ? 'pt-2' : ''}`}>{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  )
}
