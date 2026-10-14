import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { birthdaysKey, listBirthdays } from '../api/birthdays'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { NewPersonDialog } from './NewPersonDialog'

const BIRTHDAYS = '/people/birthdays'

/**
 * THE HEAD BOTH VIEWS OF PEOPLE SHARE: the name, the one way to write somebody down properly, and
 * the tabs. It is one component so that switching views moves nothing above the tabs; what only
 * one view has (Birthdays' find box) sits in that view, under them.
 */
export function PeopleHead() {
  const navigate = useNavigate()
  const [making, setMaking] = useState(false)
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1
          tabIndex={-1}
          className="ml-15 text-2xl font-semibold tracking-[-0.02em] focus:outline-none sm:ml-18"
        >
          People
        </h1>
        {/* Secondary, because All people also has the quicker way in: the box under the tabs
            takes a name when a name is all you have. This opens the form for when you already
            know where they work and how to reach them. */}
        <button type="button" onClick={() => setMaking(true)} className={BUTTON.secondary}>
          New person
        </button>
      </div>
      <PeopleViews />
      {making && (
        <NewPersonDialog
          onClose={() => setMaking(false)}
          onMade={(made) => {
            setMaking(false)
            navigate(`/people/${made.id}`)
          }}
        />
      )}
    </>
  )
}

/**
 * THE TWO VIEWS OF PEOPLE, under the page heading.
 *
 * Birthdays looks at people through their dates and makes nobody, so it is a view of this kind and
 * not a kind of its own: a tab here rather than a row in the rail. Links, because each view has an
 * address a bookmark can land on.
 */
function PeopleViews() {
  const onBirthdays = useLocation().pathname.startsWith(BIRTHDAYS)
  const tab = (current: boolean) =>
    `flex h-9 items-center gap-1.5 text-sm ${
      current
        ? 'font-semibold text-ink shadow-[inset_0_-2px_0_currentColor]'
        : 'text-ink-muted hover:text-ink'
    }`
  return (
    <nav aria-label="People views" className="mt-4 ml-15 flex gap-5 border-b border-rule sm:ml-18">
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
    <span data-count className="text-xs font-normal text-ink-subtle tabular-nums">
      {count}
    </span>
  )
}
