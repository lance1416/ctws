import { Link, useLocation } from 'react-router-dom'
import { BackIcon } from '../../platform/ui/icons'
import { useRegistry } from '../registry'

/** Pages that draw their own way back, beside their own buttons (a person's, a project's). */
const OWN_BACK = new Set(['/people', '/projects'])

/**
 * THE WAY BACK ON A PHONE (FR-082): on a thing's page, "‹ Meetings" to its kind's list, where
 * the desk has the sidebar beside it. Its forms have Cancel instead.
 */
export function PhoneBack() {
  const { pathname } = useLocation()
  const kinds = useRegistry().kinds
  const [root, id, more] = pathname.split('/').filter(Boolean)
  const kind = kinds.find((k) => k.to === `/${root}`)
  if (!kind || !id || id === 'new' || more || OWN_BACK.has(kind.to)) return null
  return (
    <Link
      to={kind.to}
      className="-ml-1 flex min-h-11 items-center gap-1 self-start text-prose text-task-t lg:hidden"
    >
      <BackIcon size={20} aria-hidden="true" />
      {kind.label}
    </Link>
  )
}
