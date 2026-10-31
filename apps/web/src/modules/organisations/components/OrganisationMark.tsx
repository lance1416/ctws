import { KIND_ICON } from '../../../platform/ui/icons'

/**
 * An organisation's mark (artboard 14): its initials on the kind's tint, square where a person is
 * round. 24 in a row, 40 at the head of its narrow page, 56 at the head of its page.
 */
export function OrganisationMark({ name, size = 24 }: { name: string; size?: 24 | 40 | 56 }) {
  // A row's mark has room for one letter; a head's for two, a word's first each (I-03).
  // Words with a letter in them: "Harbour & Lane" is HL, not H&.
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w))
  const letter =
    words.length === 0
      ? undefined
      : (size === 24 ? words.slice(0, 1) : words.slice(0, 2))
          .map((w) => [...w][0])
          .join('')
          .toLocaleUpperCase()
  const Building = KIND_ICON.organisation
  return (
    <span
      aria-hidden="true"
      // The page's 56 takes the subject step's own 600, as a large avatar does.
      className={`inline-grid shrink-0 place-items-center bg-organisation-bg text-organisation-t ${
        size === 56
          ? 'size-14 rounded-card text-subject'
          : size === 40
            ? 'size-10 rounded-card text-ui font-medium'
            : 'size-6 rounded-control text-meta font-medium'
      }`}
    >
      {/* With no name yet (a new one), the kind's icon stands in (G-04). */}
      {letter ?? <Building size={size === 24 ? 14 : size === 40 ? 20 : 24} />}
    </span>
  )
}
