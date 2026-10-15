import type { Circle, PersonResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { peopleKey, listPeople } from '../api/people'
import { PersonDetail } from '../components/PersonDetail'
import { PeopleList } from '../components/PeopleList'
import { NewPersonInput } from '../components/NewPersonInput'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { PeopleHead } from '../components/PeopleViews'
import { CIRCLE_LABELS } from '../components/BirthdayRow'
import { useCrumbs } from '../../../shell/layout/Breadcrumbs'
import { GoneNotice } from '../../../shell/detail/GoneNotice'
import { useOpenFromUrl } from '../../../shell/detail/useOpenFromUrl'
import { QueryStatus } from '../../../platform/ui/QueryStatus'
import { HANG } from '../../../platform/ui/hang'

/**
 * PEOPLE.
 *
 * One flat list, by name. No groups, no favourites, no letter index: this is one person's address
 * book, and at the size it will ever reach, sorting it by name and letting search do the rest is
 * what every person app does before it starts adding structure nobody asked for.
 */
export function People() {
  useCrumbs([{ label: 'Things', to: '/things' }, { label: 'People' }])
  const people = useQuery({ queryKey: peopleKey(), queryFn: () => listPeople() })
  // A person has no page of their own: `/people/<id>` opens them over this list.
  const { openId, open, gone, show, close } = useOpenFromUrl({
    list: people,
    idOf: (c) => c.id,
    type: 'person',
    base: '/people',
  })
  const [circle, setCircle] = useState<Circle | null>(null)

  return (
    <>
      <PeopleHead />

      {/* On the heading's edge, where the threads hang: the page's controls are one column. */}
      <div className={`mt-4 ${HANG} max-w-[52ch]`}>
        <NewPersonInput onCreated={(c: PersonResponse) => show(c.id)} />
      </div>

      {gone && <GoneNotice kind="person" />}
      <QueryStatus query={people} />
      {/* ONE LIST, FILTERED -- never a second list. The circle is how an address book that also
          holds fifty relatives stays readable, and nothing is hidden by default: a row that has
          vanished is worse than a long list. */}
      {/* The buttons' labels on the heading's edge: each button's own padding hangs left of it. */}
      <div className="mt-4 ml-[50px] flex flex-wrap gap-1 sm:ml-[62px]">
        {([null, 'family', 'friend', 'work'] as const).map((key) => {
          const picked = circle === key
          return (
            <button
              key={key ?? 'all'}
              type="button"
              aria-pressed={picked}
              onClick={() => setCircle(key)}
              // Picked is a filled chip, as the Birthdays index marks its pick: a border would
              // make one of four equal filters look like the page's button.
              className={
                picked
                  ? 'h-9 rounded-md bg-select px-2.5 text-sm font-semibold text-ink'
                  : BUTTON.quiet
              }
            >
              {key === null ? 'Everyone' : CIRCLE_LABELS[key]}
            </button>
          )
        })}
      </div>

      {people.isSuccess && (
        // A person's city is read against their name: at the task lists' measure it sat 900px away.
        <div className="mt-3 max-w-[48rem]">
          <PeopleList
            people={people.data.filter((c) => circle === null || c.circle === circle)}
            openId={openId}
            emptyLine="No people yet"
          />
        </div>
      )}

      {open && <PersonDetail person={open} onClose={close} />}
    </>
  )
}
