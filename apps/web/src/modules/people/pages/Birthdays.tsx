import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { birthdaysQuery } from '../api'
import { BirthdayRow, CIRCLE_LABELS } from '../components/BirthdayRow'
import { textbox } from '../../../platform/ui/formStyles'
import { Panel, PanelEmpty } from '../../../platform/ui/Panel'
import { MONTHS } from '../../../platform/time/dates'
import type { Circle } from '@ctws/contracts'
import { PeopleHead } from '../components/PeopleViews'
import { useCrumbs } from '../../../shell/layout/Breadcrumbs'
import { HANG } from '../../../platform/ui/hang'

/**
 * BIRTHDAYS -- a LENS. It owns nobody: this page only reads, and a person is made by the people
 * module itself, the same way the calendar owns no kind of thing.
 *
 * A PANEL GRID rather than one capped column, for the reason `Today.tsx` writes down: at 1440 a
 * single column puts one clump of rows left of centre with half the screen empty beside it. The
 * lists take two thirds; the third column answers the two questions a list cannot -- which month
 * (this IS the date search) and which kind of person.
 *
 * Finding and filtering happen in the browser: one person's book is a few dozen rows, and a round
 * trip per keystroke would make the search feel worse than the list.
 */
export function Birthdays() {
  useCrumbs([{ label: 'Things', to: '/things' }, { label: 'People' }])
  const [find, setFind] = useState('')
  const [month, setMonth] = useState<number | null>(null)
  const [circle, setCircle] = useState<Circle | null>(null)
  const view = useQuery(birthdaysQuery())

  const data = view.data
  const matches = (row: { name: string; day: string; circle: Circle | null }) =>
    (find.trim() === '' || row.name.toLowerCase().includes(find.trim().toLowerCase())) &&
    (month === null || Number(row.day.slice(5, 7)) === month) &&
    (circle === null || row.circle === circle)

  const coming = (data?.coming ?? []).filter(matches)
  const later = (data?.later ?? []).filter(matches)
  // THE COUNTS DESCRIBE WHAT IS ON SCREEN. They used to count the unfiltered answer while the
  // lists below showed the filtered one, so pressing Family left a page saying "48 people" above
  // three rows -- two answers to one question, and the reader has to pick which to believe.
  const total = coming.length + later.length

  return (
    <>
      <PeopleHead />

      <div className={`mt-4 ${HANG} flex flex-wrap items-center gap-3`}>
        <input
          value={find}
          onChange={(e) => setFind(e.target.value)}
          type="search"
          placeholder="Find a person"
          aria-label="Find a person"
          className={`w-60 bg-sheet ${textbox}`}
        />
        {total > 0 && (
          <span data-birthday-count className="text-sm text-ink-subtle tabular-nums">
            {total} {total === 1 ? 'person' : 'people'} · {coming.length} in the next week
          </span>
        )}
      </div>

      {view.isError && (
        <p role="alert" className={`mt-4 ${HANG} text-sm text-danger`}>
          Couldn&apos;t load birthdays
        </p>
      )}

      <div className="mt-4 grid min-w-0 items-start gap-4 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Panel label="Coming up" hang>
            {coming.length === 0 ? (
              <PanelEmpty hang>Nobody in the next week</PanelEmpty>
            ) : (
              <ul className="flex flex-col">
                {coming.map((row) => (
                  <BirthdayRow key={row.personId} row={row} />
                ))}
              </ul>
            )}
          </Panel>

          <Panel label="Later" hang>
            {later.length === 0 ? (
              <PanelEmpty hang>
                {total === 0 ? 'No birthdays written down yet' : 'Nobody else'}
              </PanelEmpty>
            ) : (
              <ul className="flex flex-col">
                {later.map((row) => (
                  <BirthdayRow key={row.personId} row={row} />
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel label="By month">
            <div className="flex flex-col">
              {MONTHS.map((name, i) => {
                const n = i + 1
                const count = data?.byMonth[String(n)] ?? 0
                const picked = month === n
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={picked}
                    onClick={() => setMonth(picked ? null : n)}
                    className={`flex h-8 items-center justify-between rounded-md px-2 text-left text-sm hover:bg-hover ${
                      picked ? 'bg-select font-semibold text-ink' : 'text-ink-muted'
                    }`}
                  >
                    {MONTH_NAMES[i]}
                    {/* Zero is drawn as NOTHING, the way `Panel`'s own count is. */}
                    {count > 0 && (
                      <span className="text-xs text-ink-subtle tabular-nums">{count}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </Panel>

          <Panel label="Circles">
            <div className="flex flex-col">
              {(['family', 'friend', 'work'] as const).map((key) => {
                const picked = circle === key
                const count = data?.circles[key] ?? 0
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={picked}
                    onClick={() => setCircle(picked ? null : key)}
                    className={`flex h-8 items-center justify-between rounded-md px-2 text-left text-sm hover:bg-hover ${
                      picked ? 'bg-select font-semibold text-ink' : 'text-ink-muted'
                    }`}
                  >
                    {CIRCLE_LABELS[key]}
                    {count > 0 && (
                      <span className="text-xs text-ink-subtle tabular-nums">{count}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}

/**
 * The months spelled out, because this is an index somebody reads down rather than a date beside
 * a name. `MONTHS` stays the short form every row in the app uses.
 */
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const
