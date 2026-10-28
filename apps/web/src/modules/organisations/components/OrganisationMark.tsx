import { KIND_ICON } from '../../../platform/ui/icons'

/**
 * An organisation's mark (artboard 14): its first letter on the kind's tint, square where a person
 * is round. 24 in a row, 56 at the head of its page.
 */
export function OrganisationMark({ name, size = 24 }: { name: string; size?: 24 | 56 }) {
  const letter = [...name.trim()][0]?.toLocaleUpperCase()
  const Building = KIND_ICON.organisation
  return (
    <span
      aria-hidden="true"
      className={`inline-grid shrink-0 place-items-center bg-organisation-bg font-medium text-organisation-t ${
        size === 56 ? 'size-14 rounded-card text-subject' : 'size-6 rounded-control text-meta'
      }`}
    >
      {/* With no name yet (a new one), the kind's icon stands in (G-04). */}
      {letter ?? <Building size={size === 56 ? 24 : 14} />}
    </span>
  )
}
