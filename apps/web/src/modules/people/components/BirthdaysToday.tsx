import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { countdownPhrase, monthDay, weekdayOf } from '../../../platform/time/dates'
import { Block, BlockFailed } from '../../../platform/ui/Block'
import { CakeIcon } from '../../../platform/ui/icons'
import { birthdaysQuery } from '../api'
import { PEOPLE_ID } from '../logic/id'

/**
 * BIRTHDAYS ON TODAY (FR-079, artboard 12): the people whose reminder lead has come round, as the
 * server decides; with none, the block is its head saying so.
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
              className="grid min-h-9.5 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 rounded-control px-3 hover:bg-hover"
            >
              <span className="truncate text-ui text-ink">{r.name}</span>
              <span className="text-meta text-muted">
                {r.turns !== null ? `Turns ${r.turns}` : ''}
              </span>
              <span className="text-meta whitespace-nowrap text-muted">
                {r.inDays === 0
                  ? 'Today'
                  : `${weekdayOf(r.day, true)} ${monthDay(r.day)}, ${countdownPhrase(r.inDays)}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Block>
  )
}
