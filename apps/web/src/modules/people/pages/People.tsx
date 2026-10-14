import type { Circle, PersonResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { peopleKey, listPeople } from '../api/people'
import { PersonDetail } from '../components/PersonDetail'
import { PeopleList } from '../components/PeopleList'
import { NewPersonInput } from '../components/NewPersonInput'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { PeopleHead } from '../components/PeopleViews'
import { CIRCLE_LABELS } from '../components/BirthdayRow'
import { useCrumbs } from '../../../shell/layout/Location'
import { useForgetWhenGone } from '../../../shell/search/recent'

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
  const [circle, setCircle] = useState<Circle | null>(null)

  // Looked up by id rather than held: the open person has to follow the list's refetches, or an
  // edit made in the pane would leave the pane showing what it said before.
  const open = people.data?.find((c) => c.id === openId) ?? null
  const gone = openId !== null && people.isSuccess && open === null
  useForgetWhenGone('person', openId, gone)

  return (
    <>
      <PeopleHead />

      {/* On the heading's edge, where the threads hang: the page's controls are one column. */}
      <div className="mt-4 ml-15 max-w-[52ch] sm:ml-18">
        <NewPersonInput onCreated={(c: PersonResponse) => setOpenId(c.id)} />
      </div>

      {/* 链接指向的人已经不在了：说出来。静静地只剩一个列表，读起来像链接坏了。 */}
      {gone && (
        <p role="alert" className="mt-4 ml-15 text-sm text-ink-muted sm:ml-18">
          This person is not here any more.
        </p>
      )}
      {people.isPending && <p className="mt-6 ml-15 text-ink-muted sm:ml-18">Loading…</p>}
      {people.isError && (
        <p role="alert" className="mt-6 ml-15 text-danger sm:ml-18">
          {people.error instanceof Error
            ? people.error.message
            : "Couldn't load. Check that the server is running."}
        </p>
      )}
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

      {open && <PersonDetail person={open} onClose={() => setOpenId(null)} />}
    </>
  )
}
