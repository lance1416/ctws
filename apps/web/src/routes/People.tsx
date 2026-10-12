import type { Circle, PersonResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { peopleKey, listPeople } from '../api/people'
import { PersonDetail } from '../components/PersonDetail'
import { PeopleList } from '../components/PeopleList'
import { NewPersonDialog } from '../components/NewPersonDialog'
import { NewPersonInput } from '../components/NewPersonInput'
import { LIST_MEASURE } from '../rowLead'
import { BUTTON } from '../components/buttonStyles'
import { CIRCLE_LABELS } from '../components/BirthdayRow'

/**
 * PEOPLE.
 *
 * One flat list, by name. No groups, no favourites, no letter index: this is one person's address
 * book, and at the size it will ever reach, sorting it by name and letting search do the rest is
 * what every person app does before it starts adding structure nobody asked for.
 */
export function People() {
  const people = useQuery({ queryKey: peopleKey(), queryFn: () => listPeople() })
  /**
   * 开着的是谁，写在 URL 里 —— 这一层就是 `/people/<id>` 本身。
   *
   * 一个人没有自己的页：任务也没有（`relations.to` 指的是 `/projects?task=<id>`）。URL 留着，
   * 反向链接和粘进来的链接才有地方可去；列表留在后面，筛选和滚动位置不会因为看一眼某个人就丢。
   * 状态只有一处（地址栏），所以后退、前进、刷新都不必另外伺候。
   */
  const { id: openId = null } = useParams()
  const navigate = useNavigate()
  const setOpenId = (next: string | null) => navigate(next ? `/people/${next}` : '/people')
  const heading = useRef<HTMLHeadingElement>(null)
  const [making, setMaking] = useState(false)
  const [circle, setCircle] = useState<Circle | null>(null)

  // Looked up by id rather than held: the open person has to follow the list's refetches, or an
  // edit made in the pane would leave the pane showing what it said before.
  const open = people.data?.find((c) => c.id === openId) ?? null

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
          People
        </h1>
        {/* TWO WAYS IN, because there are two moments. The box takes a name when a name is all
            you have; the button opens the form for when you are writing somebody down properly
            and already know where they work and how to reach them. */}
        <button type="button" onClick={() => setMaking(true)} className={BUTTON.secondary}>
          New person
        </button>
      </div>

      <div className={`mt-4 ${LIST_MEASURE}`}>
        <NewPersonInput onCreated={(c: PersonResponse) => setOpenId(c.id)} />
      </div>

      {/* 链接指向的人已经不在了：说出来。静静地只剩一个列表，读起来像链接坏了。 */}
      {openId !== null && people.isSuccess && open === null && (
        <p role="alert" className="mt-4 text-sm text-fg-muted">
          This person is not here any more.
        </p>
      )}
      {people.isPending && <p className="mt-6 text-fg-muted">Loading…</p>}
      {people.isError && (
        <p role="alert" className="mt-6 text-danger">
          {people.error instanceof Error
            ? people.error.message
            : "Couldn't load. Check that the server is running."}
        </p>
      )}
      {/* ONE LIST, FILTERED -- never a second list. The circle is how an address book that also
          holds fifty relatives stays readable, and nothing is hidden by default: a row that has
          vanished is worse than a long list. */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {([null, 'family', 'friend', 'work'] as const).map((key) => {
          const picked = circle === key
          return (
            <button
              key={key ?? 'all'}
              type="button"
              aria-pressed={picked}
              onClick={() => setCircle(key)}
              className={picked ? BUTTON.secondary : BUTTON.quiet}
            >
              {key === null ? 'Everyone' : CIRCLE_LABELS[key]}
            </button>
          )
        })}
      </div>

      {people.isSuccess && (
        <div className={`mt-3 ${LIST_MEASURE}`}>
          <PeopleList
            people={people.data.filter((c) => circle === null || c.circle === circle)}
            emptyLine="No people yet"
            onOpen={(c) => setOpenId(c.id)}
          />
        </div>
      )}

      {making && (
        <NewPersonDialog
          onClose={() => setMaking(false)}
          onMade={(made) => {
            setMaking(false)
            setOpenId(made.id)
          }}
        />
      )}
      {open && <PersonDetail person={open} onClose={() => setOpenId(null)} />}
    </>
  )
}
