import { KIND_ICON } from './icons'

/**
 * A person's avatar (FR-049, artboards 5 and 9): a round person-tinted disc with their initials;
 * with no name yet, the person icon (U-28, G-04). At least 24px, so the 11px letters are legible
 * (FR-008).
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
          ? 'size-14 text-subject font-medium'
          : size === 40
            ? 'size-10 text-ui font-medium'
            : `text-initials ${size === 32 ? 'size-8' : 'size-6'}`
      }`}
    >
      {initials ?? <KIND_ICON.person size={size >= 40 ? size / 2 - 4 : 14} />}
    </span>
  )
}
