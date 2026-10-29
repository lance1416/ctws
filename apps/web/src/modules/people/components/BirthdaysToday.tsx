import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { monthDay, weekdayOf } from '../../../platform/time/dates'
import { Avatar } from '../../../platform/ui/Avatar'
import { Block, BlockFailed } from '../../../platform/ui/Block'
import { PhoneSection } from '../../../platform/ui/PhoneSection'
import { CakeIcon } from '../../../platform/ui/icons'
import { birthdaysQuery } from '../api'
import { PEOPLE_ID } from '../logic/id'

/**
 * BIRTHDAYS ON TODAY (FR-079, artboard 12): the people whose reminder lead has come round, as the
 * server decides; with none, the block is its head saying so. Each row is the people overview's
 * (artboard 18): who, then the day, then how far off, each in a column of its own.
 */
export function BirthdaysToday() {
  const view = useQuery(birthdaysQuery())
  const rows = view.data?.card ?? []
  const badge = { icon: CakeIcon, tint: 'bg-person-bg text-person' }
  if (view.isError)
    return (
      <Block badge={badge} title="Birthdays">
        <BlockFailed what="birthdays" onRetry={() => void view.refetch()} />
      </Block>
    )
  return (
    <Block
      badge={badge}
      title="Birthdays"
      count={rows.length}
      empty={view.isSuccess && rows.length === 0 ? 'None to be told about today' : null}
    >
      <ul className="p-1.5">
        {rows.map((r) => (
          <li key={r.personId}>
            <Link
              to={`/${PEOPLE_ID}/${r.personId}`}
              data-birthday-row
              className="grid min-h-9.5 grid-cols-[24px_minmax(0,1fr)_auto_2.5rem] items-center gap-x-3 rounded-control px-3 hover:bg-hover"
            >
              <Avatar initials={r.initials} />
              <span className="truncate text-ui text-ink">{r.name}</span>
              <span data-birthday-day className="text-meta whitespace-nowrap text-muted">
                {weekdayOf(r.day, true)}, {monthDay(r.day)}
              </span>
              <span
                data-birthday-in
                className="text-right text-meta whitespace-nowrap text-person-t tabular-nums"
              >
                {r.inDays === 0 ? 'Today' : `${r.inDays} d`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Block>
  )
}

/** BIRTHDAYS ON A PHONE'S TODAY (FR-083): those whose reminder has come round, when any has. */
export function BirthdaysPhone() {
  const view = useQuery(birthdaysQuery())
  const rows = view.data?.card ?? []
  if (rows.length === 0) return null
  return (
    <PhoneSection
      icon={<CakeIcon size={14} className="text-person" />}
      title="Birthdays"
      count={rows.length}
    >
      {rows.map((r) => (
        <li key={r.personId}>
          <Link
            to={`/${PEOPLE_ID}/${r.personId}`}
            data-birthday-row
            className="flex min-h-14 items-center gap-3 px-3.5 py-2"
          >
            <Avatar initials={r.initials} size={32} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-prose text-ink">{r.name}</span>
              <span className="text-ui text-muted">
                {weekdayOf(r.day, true)}, {monthDay(r.day)}
              </span>
            </span>
            <span className="inline-flex h-6 items-center rounded-control bg-person-bg px-2 text-ui font-medium text-person-t">
              {r.inDays === 0 ? 'Today' : `in ${r.inDays} days`}
            </span>
          </Link>
        </li>
      ))}
    </PhoneSection>
  )
}
