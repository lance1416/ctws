import type { AwaitingRow, OrganisationInTouch } from '@ctws/contracts'
import { avatarInitials } from '@ctws/core'
import { useQuery } from '@tanstack/react-query'
import { useContext, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { keyLabel } from '../../../platform/keyboard/keys'
import { shortDay, ymd } from '../../../platform/time/dates'
import { Avatar } from '../../../platform/ui/Avatar'
import { Block, BlockFailed } from '../../../platform/ui/Block'
import { BUTTON, KEY_ON_INK } from '../../../platform/ui/buttonStyles'
import { FollowUpIcon, NewIcon, ReceivedIcon, SentIcon } from '../../../platform/ui/icons'
import { PageHead } from '../../../platform/ui/PageHead'
import { StageLabel } from '../../../platform/ui/StageLabel'
import { useAccountToday, useTimeZone } from '../../../shell/auth'
import { NewContext } from '../../../shell/creates'
import { ModuleEmpty } from '../../../shell/layout'
import { ProjectSquare, useEveryProject } from '../../../shell/projects'
import { useRegistry } from '../../../shell/registry'
import { OrganisationMark } from '../../organisations'
import { usePeople } from '../../people'
import { overviewQuery } from '../api'
import { AwaitingActions } from '../components/AwaitingActions'
import { followUpChip, followUpTone, nextWords } from '../logic/followUp'

/** Each table shows this many before "All N" (FR-015). */
const SHOWN = 5

/** A day or a state's chip, in its tone (FR-071): red when late, amber when near, grey after. */
export const TONE = {
  late: 'bg-stop-bg text-stop-t',
  soon: 'bg-warn-bg text-warn-t',
  later: 'bg-hover text-muted',
} as const

/**
 * THE COMMUNICATION OVERVIEW (FR-071, artboard 15): who has not replied, and where each
 * organisation in touch stands: the table for "which firm is at which step".
 */
export function CommunicationOverview() {
  const overview = useQuery(overviewQuery())
  const openNew = useContext(NewContext)
  const creator = useRegistry().creates.find((c) => c.kind === 'communication')
  if (overview.isSuccess && overview.data.awaiting.length + overview.data.inTouch.length === 0)
    return <ModuleEmpty kind="communication" />
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <PageHead>Communication</PageHead>
        </div>
        {creator && (
          <button
            type="button"
            onClick={() => openNew(creator, { opens: true })}
            className={BUTTON.primary}
          >
            <NewIcon size={16} aria-hidden="true" />
            Log a message
            <kbd className={KEY_ON_INK}>{keyLabel('N X')}</kbd>
          </button>
        )}
      </div>
      {overview.isError ? (
        <BlockFailed what="communication" onRetry={() => void overview.refetch()} />
      ) : (
        <>
          <Awaiting rows={overview.data?.awaiting ?? []} done={overview.isSuccess} />
          <InTouch rows={overview.data?.inTouch ?? []} done={overview.isSuccess} />
        </>
      )}
    </div>
  )
}

/** A table's head row: the columns' names, in `cols`. */
function Heads({ cols, names }: { cols: string; names: readonly string[] }) {
  return (
    <div
      aria-hidden="true"
      className={`grid h-8 items-center gap-x-3 border-b border-line px-3 text-meta text-muted ${cols}`}
    >
      {names.map((n, i) => (
        <span key={i}>{n}</span>
      ))}
    </div>
  )
}

/** "All N": the rest of a table, in place (FR-015). */
function More({ rows, shown, onAll }: { rows: number; shown: number; onAll: () => void }) {
  if (rows <= shown) return null
  return (
    <button
      type="button"
      onClick={onAll}
      className="flex h-9 w-full items-center border-t border-line px-3 text-ui text-muted hover:bg-hover hover:text-ink"
    >
      All {rows}
    </button>
  )
}

// The actions have a width of their own, so the heads line up over rows that have them.
const AWAITING_COLS = 'grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_4.5rem_4.5rem_8rem_12rem]'

function Awaiting({ rows, done }: { rows: AwaitingRow[]; done: boolean }) {
  const [all, setAll] = useState(false)
  const shown = all ? rows : rows.slice(0, SHOWN)
  return (
    <Block
      kind="communication"
      title="Awaiting reply"
      count={rows.length}
      empty={done && rows.length === 0 ? 'None' : null}
    >
      <Heads cols={AWAITING_COLS} names={['With', 'About', 'Sent', 'Waiting', 'Follow up', '']} />
      <ul className="flex flex-col">
        {shown.map((r) => (
          <AwaitingLine key={r.id} row={r} />
        ))}
      </ul>
      <More rows={rows.length} shown={shown.length} onAll={() => setAll(true)} />
    </Block>
  )
}

function AwaitingLine({ row }: { row: AwaitingRow }) {
  const today = useAccountToday()
  const timeZone = useTimeZone()
  const sent = ymd(new Date(row.occurredAt), timeZone)
  return (
    <li
      data-awaiting={row.id}
      className={`grid min-h-12 items-center gap-x-3 border-b border-line px-3 py-1.5 last:border-b-0 ${AWAITING_COLS}`}
    >
      <With row={row} />
      <About projectId={row.projectId} to={`/communication/${row.id}`}>
        {row.subject ?? 'No subject'}
      </About>
      <span className="font-mono text-meta text-muted tabular-nums">
        {sent === today ? 'Today' : shortDay(sent, today)}
      </span>
      <span className="text-ui text-ink">
        {row.waitingDays === 1 ? '1 day' : `${row.waitingDays} days`}
      </span>
      <span>
        {row.followUpOn && (
          <span
            className={`inline-flex h-6 items-center gap-1 rounded-control px-2 text-meta font-medium ${TONE[followUpTone(row.followUpOn, today)]}`}
          >
            <FollowUpIcon size={12} aria-hidden="true" />
            {followUpChip(row.followUpOn, today)}
          </span>
        )}
      </span>
      <AwaitingActions message={row} later="pick" />
    </li>
  )
}

/** Who it is with: the first person, by avatar and name, and their organisation under it. */
function With({ row }: { row: AwaitingRow }) {
  const people = usePeople()
  const person = row.parties.find((p) => p.type === 'person')
  const org = row.parties.find((p) => p.type === 'organisation')
  if (!person && !org) return <span className="text-ui text-subtle">No one</span>
  if (!person)
    return (
      <span className="flex min-w-0 items-center gap-2.5">
        <OrganisationMark name={org!.name} />
        <span className="truncate text-ui text-ink">{org!.name}</span>
      </span>
    )
  const known = people.data?.find((p) => p.id === person.id)
  return (
    <Link to={`/people/${person.id}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
      <Avatar initials={known ? avatarInitials(known) : ([...person.name][0] ?? '')} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-ui text-ink">{person.name}</span>
        {org && <span className="truncate text-meta text-muted">{org.name}</span>}
      </span>
    </Link>
  )
}

/** What it is about: its project's square and the subject, opening the message. */
function About({
  projectId,
  to,
  children,
}: {
  projectId: string | null
  to: string
  children: ReactNode
}) {
  const project = useEveryProject().data?.find((p) => p.id === projectId)
  return (
    <Link to={to} className="flex min-w-0 items-center gap-2 text-ui text-ink hover:underline">
      {project && <ProjectSquare project={project} />}
      <span className="truncate">{children}</span>
    </Link>
  )
}

const IN_TOUCH_COLS = 'grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,2fr)_9rem]'

function InTouch({ rows, done }: { rows: OrganisationInTouch[]; done: boolean }) {
  const [all, setAll] = useState(false)
  const shown = all ? rows : rows.slice(0, SHOWN)
  return (
    <Block
      kind="organisation"
      title="Organisations in touch"
      count="Last 30 days"
      empty={done && rows.length === 0 ? 'None in the last 30 days' : null}
    >
      <Heads
        cols={IN_TOUCH_COLS}
        names={['Organisation', 'Project', 'Stage', 'Last contact', 'Next']}
      />
      <ul className="flex flex-col">
        {shown.map((r) => (
          <InTouchLine key={r.organisationId} row={r} />
        ))}
      </ul>
      <More rows={rows.length} shown={shown.length} onAll={() => setAll(true)} />
    </Block>
  )
}

function InTouchLine({ row }: { row: OrganisationInTouch }) {
  const today = useAccountToday()
  const timeZone = useTimeZone()
  const project = useEveryProject().data?.find((p) => p.id === row.standing?.projectId)
  const day = ymd(new Date(row.lastContact.occurredAt), timeZone)
  const Way = row.lastContact.direction === 'sent' ? SentIcon : ReceivedIcon
  const next = nextWords(row.next, today)
  return (
    <li
      data-in-touch={row.organisationId}
      className={`grid min-h-11 items-center gap-x-3 border-b border-line px-3 last:border-b-0 ${IN_TOUCH_COLS}`}
    >
      <Link
        to={`/organisations/${row.organisationId}`}
        className="flex min-w-0 items-center gap-2.5 text-ui text-ink hover:underline"
      >
        <OrganisationMark name={row.organisationName} />
        <span className="truncate">{row.organisationName}</span>
      </Link>
      <span className="min-w-0">
        {row.standing && (
          <Link
            to={`/projects/${row.standing.projectId}`}
            className="flex min-w-0 items-center gap-2 text-ui text-ink hover:underline"
          >
            {project && <ProjectSquare project={project} />}
            <span className="truncate">{row.standing.projectName}</span>
          </Link>
        )}
      </span>
      <span className="min-w-0">
        {row.standing?.stage && <StageLabel name={row.standing.stage} quiet={false} />}
      </span>
      <Link
        to={`/communication/${row.lastContact.communicationId}`}
        className="flex min-w-0 items-center gap-2.5 text-ui text-ink hover:underline"
      >
        <span className="inline-grid size-6 shrink-0 place-items-center rounded-control bg-communication-bg text-communication">
          <Way size={14} aria-hidden="true" />
          <span className="sr-only">
            {row.lastContact.direction === 'sent' ? 'Sent' : 'Received'}
          </span>
        </span>
        <span className="w-12 shrink-0 font-mono text-meta text-muted tabular-nums">
          {day === today ? 'Today' : shortDay(day, today)}
        </span>
        <span className="truncate">{row.lastContact.subject ?? 'No subject'}</span>
      </Link>
      <span>
        {next.tone === 'later' ? (
          <span className="text-meta text-muted">{next.text}</span>
        ) : (
          <span
            className={`inline-flex h-6 items-center rounded-control px-2 text-meta font-medium ${TONE[next.tone]}`}
          >
            {next.text}
          </span>
        )}
      </span>
    </li>
  )
}
