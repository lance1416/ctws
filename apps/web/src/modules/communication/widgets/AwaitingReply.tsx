import { avatarInitials } from '@ctws/core'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Avatar } from '../../../platform/ui/Avatar'
import { Block, BlockFailed, SkeletonRows } from '../../../platform/ui/Block'
import { useRowsThatFit } from '../../../shell/workbench'
import { OrganisationMark } from '../../organisations'
import { usePeople } from '../../people'
import { followUpsQuery } from '../api'
import { COMMUNICATION_ID } from '../logic/id'

/** Waiting this many days or more, the wait is amber. */
const LONG_WAIT = 4
/** A row: two lines and its gap. */
const ROW_PX = 48

/**
 * AWAITING REPLY ON THE WORKBENCH (FR-076, artboards 10 and 22): the messages whose follow-up day
 * has come, the longest wait first, each with who it is with, what it was about and how long it
 * has waited; amber from four days. As many as the place holds; the rest are in Communication.
 */
export function AwaitingReply() {
  const due = useQuery(followUpsQuery())
  const people = usePeople()
  // The longest wait first: it is the one to chase.
  const rows = [...(due.data ?? [])].sort((a, b) => b.waitingDays - a.waitingDays)
  const [list, fits] = useRowsThatFit(ROW_PX, 5)
  return (
    <Block
      kind="communication"
      title="Awaiting reply"
      count={rows.length}
      empty={due.isSuccess && rows.length === 0 ? 'Nobody to follow up with.' : null}
      keepsSize
    >
      {due.isError ? (
        <BlockFailed what="follow-ups" onRetry={() => void due.refetch()} />
      ) : !due.isSuccess ? (
        <SkeletonRows rows={2} />
      ) : (
        <ul ref={list} className="flex min-h-0 flex-1 flex-col p-1.5">
          {rows.slice(0, fits).map((m) => {
            const person = m.parties.find((p) => p.type === 'person')
            const org = m.parties.find((p) => p.type === 'organisation')
            const known = person ? people.data?.find((p) => p.id === person.id) : undefined
            const who = person ?? org
            return (
              <li key={m.id}>
                <Link
                  to={`/${COMMUNICATION_ID}/${m.id}`}
                  data-awaiting={m.id}
                  className="grid h-12 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-control px-3 hover:bg-hover"
                >
                  {person ? (
                    <Avatar
                      initials={known ? avatarInitials(known) : ([...person.name][0] ?? '')}
                    />
                  ) : (
                    <OrganisationMark name={org?.name ?? '?'} />
                  )}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-ui font-medium text-ink">
                      {m.subject ?? 'No subject'}
                    </span>
                    {who && <span className="truncate text-meta text-muted">{who.name}</span>}
                  </span>
                  <span
                    className={`inline-flex h-5.5 items-center rounded-control px-2 text-meta font-medium whitespace-nowrap ${
                      m.waitingDays >= LONG_WAIT ? 'bg-warn-bg text-warn-t' : 'bg-hover text-muted'
                    }`}
                  >
                    {m.waitingDays === 1 ? '1 day' : `${m.waitingDays} days`}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Block>
  )
}
