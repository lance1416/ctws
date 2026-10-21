import { ModuleEmpty, useSubjectOf } from '../../../shell/layout'
import { type Circle, CIRCLES, type PersonResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { peopleQuery } from '../api'
import { PersonDetail } from '../components/PersonDetail'
import { PeopleList } from '../components/PeopleList'
import { NewPersonInput } from '../components/NewPersonInput'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { PeopleHead } from '../components/PeopleViews'
import { CIRCLE_LABELS } from '../logic/labels'
import { DeletedNotice, useOpenFromUrl } from '../../../shell/detail'
import { QueryStatus } from '../../../platform/ui/QueryStatus'
import { HANG } from '../../../platform/ui/hang'

/** One flat list by name, filtered by circle; search does the rest. */
export function People() {
  const people = useQuery(peopleQuery())
  // A person has no page of their own: `/people/<id>` opens them over this list.
  const { openId, open, gone, show, close } = useOpenFromUrl({
    list: people,
    idOf: (c) => c.id,
    type: 'person',
    base: '/people',
  })
  useSubjectOf(open ? { type: 'person', id: open.id, title: open.name } : null)
  const [circle, setCircle] = useState<Circle | null>(null)

  // An old address to someone deleted: the main area is what happened to them (artboard 23).
  if (gone && openId) return <DeletedNotice type="person" id={openId} />
  // Nobody yet: the badge, a line and New person, nothing else (FR-030, artboard 23).
  if (people.isSuccess && people.data.length === 0) return <ModuleEmpty kind="person" />

  return (
    <>
      <PeopleHead />

      <div className={`mt-4 ${HANG} max-w-[52ch]`}>
        <NewPersonInput onCreated={(c: PersonResponse) => show(c.id)} />
      </div>

      <QueryStatus query={people} />
      {/* One list, filtered by circle; nothing is hidden by default. */}
      {/* Less the pills' own `px-2.5`, so their words start on the hang. */}
      <div className="mt-4 ml-[calc(var(--hang)-var(--spacing)*2.5)] flex flex-wrap gap-1">
        {[null, ...CIRCLES].map((key) => {
          const picked = circle === key
          return (
            <button
              key={key ?? 'all'}
              type="button"
              aria-pressed={picked}
              onClick={() => setCircle(key)}
              // Filled, not bordered, so a picked filter does not look like the page's button.
              className={
                picked
                  ? 'h-9 rounded-control bg-select px-2.5 text-ui font-medium text-ink'
                  : BUTTON.quiet
              }
            >
              {key === null ? 'Everyone' : CIRCLE_LABELS[key]}
            </button>
          )
        })}
      </div>

      {people.isSuccess && people.data.length > 0 && (
        // Narrower than the task lists, so a person's city stays near their name.
        <div className="mt-3 max-w-[48rem]">
          <PeopleList
            people={people.data.filter((c) => circle === null || c.circle === circle)}
            openId={openId}
            emptyLine="No people yet"
          />
        </div>
      )}

      {/* Keyed, so another person's pane starts clean: no edit or unsaved note carries over. */}
      {open && <PersonDetail key={open.id} person={open} onClose={close} />}
    </>
  )
}
