import { KIND_ICON } from './icons'

/**
 * A person's initials, or the person icon when there is no name yet. At least 24px, so the
 * letters stay legible.
 */
export function Avatar({
  initials,
  size = 24,
}: {
  initials: string | null
  size?: 24 | 32 | 40 | 56
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-grid shrink-0 place-items-center rounded-full bg-person-bg text-person-t ${
        size === 56
          ? 'size-14 text-subject'
          : size === 40
            ? 'size-10 text-ui font-medium'
            : `text-initials ${size === 32 ? 'size-8' : 'size-6'}`
      }`}
    >
      {initials ?? <KIND_ICON.person size={size >= 40 ? size / 2 - 4 : 14} />}
    </span>
  )
}
