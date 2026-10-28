import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { weekdayDay } from '../../../platform/time/dates'
import { Avatar } from '../../../platform/ui/Avatar'
import { Block, BlockFailed, SkeletonRows } from '../../../platform/ui/Block'
import { CakeIcon } from '../../../platform/ui/icons'
import { useRowsThatFit } from '../../../shell/workbench'
import { birthdaysQuery } from '../api'
import { PEOPLE_ID } from '../logic/id'

/** A row: two lines and its gap. */
const ROW_PX = 44

/**
 * BIRTHDAYS ON THE WORKBENCH (FR-076, artboards 10 and 22): the next birthdays, each with the
 * person's avatar and name, the day, and how many days off; the nearest in the person colour. As
 * many as the place holds; the rest are on the birthdays page.
 */
export function UpcomingBirthdays() {
  const view = useQuery(birthdaysQuery())
  const [list, fits] = useRowsThatFit(ROW_PX, 5)
  const rows = [...(view.data?.coming ?? []), ...(view.data?.later ?? [])]
  const today = view.data?.today ?? ''
  return (
    <Block
      badge={{ icon: CakeIcon, tint: 'bg-person-bg text-person' }}
      title="Birthdays"
      empty={view.isSuccess && rows.length === 0 ? 'No birthdays recorded' : null}
    >
      {view.isError ? (
        <BlockFailed what="birthdays" onRetry={() => void view.refetch()} />
      ) : !view.isSuccess ? (
        <SkeletonRows rows={3} />
      ) : (
        <ul ref={list} className="flex min-h-0 flex-1 flex-col overflow-hidden p-1.5">
          {rows.slice(0, fits).map((b, i) => (
            <li key={b.personId}>
              <Link
                to={`/${PEOPLE_ID}/${b.personId}`}
                data-birthday={b.personId}
                className="grid h-11 grid-cols-[24px_minmax(0,1fr)_56px] items-center gap-x-2.5 rounded-control px-3 hover:bg-hover"
              >
                <Avatar initials={b.initials} />
                <span className="flex min-w-0 flex-col">
                  <span className={`truncate text-ui text-ink ${i === 0 ? 'font-medium' : ''}`}>
                    {b.name}
                  </span>
                  <span className="text-meta text-muted">{weekdayDay(b.day, today)}</span>
                </span>
                <span
                  className={`justify-self-end text-ui tabular-nums ${i === 0 ? 'font-medium text-person-t' : 'text-muted'}`}
                >
                  {b.inDays === 0 ? 'Today' : `${b.inDays} d`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Block>
  )
}
