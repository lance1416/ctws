import type { ReactNode } from 'react'

/** A labelled value in a detail pane: the label above, the value under it. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="block text-xs text-ink-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </div>
  )
}
