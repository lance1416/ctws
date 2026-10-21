import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { DetailHead } from '../../platform/ui/DetailPane'

/** The pane's head: back to the kind's list, and the close button. `note` sits beside the link. */
export function BackHead({
  to,
  label,
  onClose,
  note,
}: {
  to: string
  label: string
  onClose: () => void
  note?: ReactNode
}) {
  const link = (
    <Link to={to} className="rounded-control text-ui text-muted hover:text-ink hover:underline">
      ← {label}
    </Link>
  )
  return (
    <div>
      <DetailHead
        kind={
          note ? (
            <span className="flex min-w-0 items-center gap-1.5 text-ui text-muted">
              {link}
              {note}
            </span>
          ) : (
            link
          )
        }
        onClose={onClose}
      />
    </div>
  )
}
