import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { countdownPhrase, shortDay, weekdayOf } from '../../../platform/time/dates'
import { LINK } from '../../../platform/ui/buttonStyles'
import { PanelEmpty } from '../../../platform/ui/Panel'
import { birthdaysQuery } from '../api'
import { PEOPLE_ID } from '../logic/id'

/**
 * The people whose reminder lead has come round, as the server decides. Nothing pushes, so a week
 * the app is never opened is a week it cannot tell you.
 */
export function BirthdayCard() {
  const view = useQuery(birthdaysQuery())
  const rows = view.data?.card ?? []
  const next = view.data?.coming[0] ?? view.data?.later[0]
  const today = view.data?.today ?? ''
  if (view.isError) {
    return (
      <p role="alert" className="px-2 py-1.5 text-sm text-danger">
        Couldn&apos;t load birthdays
      </p>
    )
  }
  if (rows.length === 0) {
    // Empty means no lead has come round, not that nobody is due this week: a birthday in three
    // days with a same-day reminder is both. Only with no next person is no birthday recorded.
    return (
      <PanelEmpty>
        {next ? (
          <>
            Nobody to greet yet.{' '}
            <Link to={`/${PEOPLE_ID}/birthdays`} className={LINK}>
              {next.name} is next, {countdownPhrase(next.inDays)}.
            </Link>
          </>
        ) : (
          'No birthdays yet.'
        )}
      </PanelEmpty>
    )
  }
  const [first, ...more] = rows
  return (
    <div className="px-2">
      <Link to={`/${PEOPLE_ID}/${first!.personId}`} data-birthday-row className="block">
        <span className="block text-xl font-semibold">{first!.name}</span>
        <span className="mt-0.5 block">
          {weekdayOf(first!.day, true)}, {shortDay(first!.day, today)},{' '}
          {countdownPhrase(first!.inDays)}
        </span>
        {first!.lunarDate && (
          <span className="block text-sm text-ink-subtle">{first!.lunarDate}</span>
        )}
      </Link>
      {more.length > 0 && (
        <ul className="mt-3.5 flex flex-col">
          {more.slice(0, 2).map((r) => (
            <li key={r.personId}>
              <Link
                to={`/${PEOPLE_ID}/${r.personId}`}
                data-birthday-row
                className="flex min-h-[30px] items-baseline gap-2.5 pt-1 text-sm hover:bg-hover"
              >
                <span className="min-w-0 truncate">{r.name}</span>
                <span className="ml-auto shrink-0 text-ink-subtle tabular-nums">
                  {r.inDays === 0 ? 'today' : shortDay(r.day, today)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
