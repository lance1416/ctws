import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { birthdaysKey, listBirthdays } from '../api/birthdays'

const BIRTHDAYS = '/people/birthdays'

/**
 * THE TWO VIEWS OF PEOPLE, under the page heading.
 *
 * Birthdays looks at people through their dates and makes nobody, so it is a view of this kind and
 * not a kind of its own: a tab here rather than a row in the rail. Links, because each view has an
 * address a bookmark can land on.
 */
export function PeopleViews() {
  const onBirthdays = useLocation().pathname.startsWith(BIRTHDAYS)
  const tab = (current: boolean) =>
    `flex h-9 items-center gap-1.5 text-sm ${
      current
        ? 'font-semibold text-fg shadow-[inset_0_-2px_0_currentColor]'
        : 'text-fg-muted hover:text-fg'
    }`
  return (
    <nav aria-label="People views" className="mt-3 flex gap-5 border-b border-border-subtle">
      <Link
        to="/people"
        aria-current={onBirthdays ? undefined : 'page'}
        className={tab(!onBirthdays)}
      >
        All people
      </Link>
      <Link
        to={BIRTHDAYS}
        aria-current={onBirthdays ? 'page' : undefined}
        className={tab(onBirthdays)}
      >
        Birthdays
        <BirthdayCount />
      </Link>
    </nav>
  )
}

/** How many birthdays the next week holds. Shares the Birthdays page's cache entry. */
function BirthdayCount() {
  const view = useQuery({ queryKey: birthdaysKey(), queryFn: listBirthdays })
  const count = view.data?.coming.length ?? 0
  if (count <= 0) return null
  return (
    <span data-count className="text-xs font-normal text-fg-subtle tabular-nums">
      {count}
    </span>
  )
}
