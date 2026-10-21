import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { birthdaysQuery } from '../api'
import { Button } from '../../../platform/ui/Button'
import { NewPersonDialog } from './NewPersonDialog'
import { PageHead } from '../../../platform/ui/PageHead'
import { HANG } from '../../../platform/ui/hang'

const BIRTHDAYS = '/people/birthdays'

/** The head both people views share, so switching views moves nothing above the tabs. */
export function PeopleHead() {
  const navigate = useNavigate()
  const [making, setMaking] = useState(false)
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <PageHead hang>People</PageHead>
        {/* Secondary: the box under the tabs is the quicker way in when a name is all you have. */}
        <Button look="secondary" onClick={() => setMaking(true)}>
          New person
        </Button>
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

/** Birthdays is a view of people, so it is a tab here; links, so each view has an address. */
function PeopleViews() {
  const onBirthdays = useLocation().pathname.startsWith(BIRTHDAYS)
  const tab = (current: boolean) =>
    `flex h-9 items-center gap-1.5 text-ui ${
      current
        ? 'font-medium text-ink shadow-[inset_0_-2px_0_currentColor]'
        : 'text-muted hover:text-ink'
    }`
  return (
    <nav aria-label="People views" className={`mt-4 ${HANG} flex gap-5 border-b border-line`}>
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

function BirthdayCount() {
  const view = useQuery(birthdaysQuery())
  const count = view.data?.coming.length ?? 0
  if (count <= 0) return null
  return (
    <span data-count className="text-meta font-normal text-subtle tabular-nums">
      {count}
    </span>
  )
}
